import { Context, DateTime, Effect, Layer, Ref, Schema, Stream } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"
import { Egress } from "server/platform/egress"

import { CredentialCrypto } from "auth/services/crypto"
import { MediaDb } from "db/services/media"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig, WorkerBindings } from "env/server"
import type { MediaListInput } from "rpc/contracts/media"
import { Media } from "rpc/contracts/media"
import { ApiError } from "rpc/lib/errors"
import { Name } from "rpc/lib/schema"

// Cloudflare supplies this class at runtime.
declare const FixedLengthStream: new (
  length: number | bigint,
) => Readonly<ReadableWritablePair<Uint8Array, Uint8Array>>

const ImageLimit = 10000000

const VideoLimit = 100000000

type UploadBody = Extract<
  Parameters<WorkerBindings["MEDIA"]["put"]>[1],
  {
    getReader: unknown
  }
>

// Cloudflare and DOM types use different stream declarations.
const WorkerBody = Schema.declare(
  (value: unknown): value is UploadBody => value instanceof ReadableStream,
)

const WebBody = Schema.declare(
  (value: unknown): value is ReadableStream<Uint8Array> =>
    value instanceof ReadableStream,
)

const PublicMediaToken = Schema.Struct({
  mediaId: Schema.String,
  workspaceId: Schema.String,
  expiresAt: Schema.Number,
})

function storageFailure() {
  return new ApiError({
    code: "storage-failure",
    message: "Media storage could not complete the operation.",
  })
}

function validMagic(type: string, prefix: Uint8Array) {
  const text = new TextDecoder().decode(prefix)

  switch (type) {
    case "image/png":
      return [137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, index) => prefix[index] === byte,
      )
    case "image/jpeg":
      return prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255
    case "image/gif":
      return text.startsWith("GIF87a") || text.startsWith("GIF89a")
    case "image/webp":
      return text.startsWith("RIFF") && text.slice(8, 12) === "WEBP"
    case "video/mp4":
      return text.slice(4, 8) === "ftyp"
    case "video/quicktime":
      return ["ftyp", "moov", "mdat"].includes(text.slice(4, 8))
    case "video/webm":
      return [26, 69, 223, 163].every((byte, index) => prefix[index] === byte)
    default:
      return false
  }
}

function mediaType(value: string) {
  const type = value.split(";")[0]?.trim().toLowerCase() ?? ""

  return [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "video/quicktime",
    "video/webm",
  ].includes(type)
    ? Effect.succeed(type)
    : Effect.fail(
        new ApiError({
          code: "invalid-input",
          message: "Use a supported image or video file.",
        }),
      )
}

function byteRange(value: string | null, size: number) {
  if (value === null) return { valid: true, range: null }
  const match = /^bytes=(\d*)-(\d*)$/.exec(value)

  if (!match || (!match[1] && !match[2])) return { valid: false, range: null }
  const suffix = !match[1]
  const start = suffix ? Math.max(0, size - Number(match[2])) : Number(match[1])

  const end =
    suffix || !match[2] ? size - 1 : Math.min(size - 1, Number(match[2]))

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start ||
    (suffix && Number(match[2]) === 0)
  ) {
    return { valid: false, range: null }
  }

  return { valid: true, range: { offset: start, length: end - start + 1 } }
}

function makeMedia(bindings: Pick<WorkerBindings, "MEDIA">, config: AppConfig) {
  return Effect.gen(function* () {
    const workspacesDb = yield* WorkspacesDb
    const mediaDb = yield* MediaDb
    const gate = yield* OperationGate
    const secrets = yield* CredentialCrypto
    const egress = yield* Egress

    function upload(
      userId: string,
      workspaceId: string,
      name: string,
      declaredType: string,
      body: ReadableStream<Uint8Array>,
      declaredLength?: number,
    ) {
      return Effect.scoped(
        Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({ userId, workspaceId })

          const safeName = yield* Schema.decodeUnknownEffect(Name)(name).pipe(
            Effect.mapError(
              () =>
                new ApiError({
                  code: "invalid-input",
                  message: "Use a valid file name.",
                }),
            ),
          )

          const type = yield* mediaType(declaredType)
          const limit = type.startsWith("image/") ? ImageLimit : VideoLimit

          if (declaredLength !== undefined && declaredLength > limit) {
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "The file exceeds the upload size limit.",
              }),
            )
          }

          const reader = yield* Effect.acquireRelease(
            Effect.sync(() => body.getReader()),
            (resource) =>
              Effect.tryPromise({
                try: () => resource.cancel(),
                catch: storageFailure,
              }).pipe(
                Effect.catch(() =>
                  Effect.logWarning("Media reader could not be closed."),
                ),
              ),
          )

          function read() {
            return Effect.tryPromise({
              try: () => reader.read(),
              catch: () =>
                new ApiError({
                  code: "invalid-input",
                  message: "The upload could not be read.",
                }),
            })
          }

          const prefixChunks: Uint8Array[] = []
          let prefixSize = 0

          while (prefixSize < 16) {
            const next = yield* read()

            if (next.done) break
            prefixSize += next.value.byteLength

            if (prefixSize > limit) {
              return yield* Effect.fail(
                new ApiError({
                  code: "invalid-input",
                  message: "The file exceeds the upload size limit.",
                }),
              )
            }

            prefixChunks.push(next.value)
          }

          const prefix = new Uint8Array(Math.min(16, prefixSize))
          let offset = 0

          for (const chunk of prefixChunks) {
            const part = chunk.subarray(0, prefix.length - offset)
            prefix.set(part, offset)
            offset += part.byteLength

            if (offset === prefix.length) break
          }

          if (!validMagic(type, prefix)) {
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "The file content does not match its media type.",
              }),
            )
          }

          const size = yield* Ref.make(prefixSize)

          const remaining = Stream.unfold(undefined, () =>
            read().pipe(
              Effect.flatMap((next) => {
                if (next.done) return Effect.succeed(undefined)

                return Ref.updateAndGet(
                  size,
                  (current) => current + next.value.byteLength,
                ).pipe(
                  Effect.flatMap((total) =>
                    total > limit
                      ? Effect.fail(
                          new ApiError({
                            code: "invalid-input",
                            message: "The file exceeds the upload size limit.",
                          }),
                        )
                      : Effect.succeed([next.value, undefined] as const),
                  ),
                )
              }),
            ),
          )

          const chunks = Stream.concat(
            Stream.fromIterable(prefixChunks),
            remaining,
          )

          const id = crypto.randomUUID()
          const objectKey = `${workspaceId}/${id}`

          let linked = false

          yield* Effect.addFinalizer(() =>
            linked
              ? Effect.void
              : Effect.tryPromise({
                  try: () => bindings.MEDIA.delete(objectKey),
                  catch: storageFailure,
                }).pipe(
                  Effect.catch(() =>
                    Effect.logError("Unlinked media could not be removed."),
                  ),
                ),
          )

          const stored = yield* Effect.gen(function* () {
            if (declaredLength !== undefined) {
              // R2 requires a stream with a known length after prefix validation.
              const fixed = new FixedLengthStream(declaredLength)

              const uploadBody = yield* Schema.decodeUnknownEffect(WorkerBody)(
                fixed.readable,
              ).pipe(Effect.mapError(storageFailure))

              // Keep the upload error if writer abort also rejects R2 storage.
              let producerError: ApiError | undefined

              const [, object] = yield* Effect.all(
                [
                  Effect.gen(function* () {
                    const writer = yield* Effect.acquireRelease(
                      Effect.sync(() => fixed.writable.getWriter()),
                      (resource) =>
                        Effect.tryPromise({
                          try: () => resource.abort(),
                          catch: storageFailure,
                        }).pipe(Effect.catch(() => Effect.void)),
                    )

                    yield* Stream.runForEach(chunks, (chunk) =>
                      Effect.tryPromise({
                        try: () => writer.write(chunk),
                        catch: storageFailure,
                      }),
                    )
                    yield* Effect.tryPromise({
                      try: () => writer.close(),
                      catch: storageFailure,
                    })
                  }).pipe(
                    Effect.tapError((error) =>
                      Effect.sync(() => {
                        producerError = error
                      }),
                    ),
                    Effect.scoped,
                  ),
                  Effect.tryPromise({
                    try: () =>
                      bindings.MEDIA.put(objectKey, uploadBody, {
                        httpMetadata: { contentType: type },
                      }),
                    catch: storageFailure,
                  }).pipe(Effect.uninterruptible),
                ],
                { concurrency: 2 },
              ).pipe(
                Effect.catch((error) => Effect.fail(producerError ?? error)),
              )

              return object
            }

            let completed = false

            const multipart = yield* Effect.acquireRelease(
              Effect.tryPromise({
                try: () =>
                  bindings.MEDIA.createMultipartUpload(objectKey, {
                    httpMetadata: { contentType: type },
                  }),
                catch: storageFailure,
              }),
              (resource) =>
                completed
                  ? Effect.void
                  : Effect.tryPromise({
                      try: () => resource.abort(),
                      catch: storageFailure,
                    }).pipe(
                      Effect.catch(() =>
                        Effect.logWarning(
                          "Media multipart upload could not be closed.",
                        ),
                      ),
                    ),
            )

            const parts: Awaited<ReturnType<typeof multipart.uploadPart>>[] = []
            // R2 requires 5 MiB parts, except for the final part.
            const buffer = new Uint8Array(5 * 1024 * 1024)
            let buffered = 0

            yield* Stream.runForEach(chunks, (chunk) =>
              Effect.gen(function* () {
                let position = 0

                while (position < chunk.byteLength) {
                  const length = Math.min(
                    buffer.length - buffered,
                    chunk.byteLength - position,
                  )

                  buffer.set(
                    chunk.subarray(position, position + length),
                    buffered,
                  )
                  buffered += length
                  position += length

                  if (buffered === buffer.length) {
                    parts.push(
                      yield* Effect.tryPromise({
                        try: () =>
                          multipart.uploadPart(parts.length + 1, buffer),
                        catch: storageFailure,
                      }).pipe(Effect.uninterruptible),
                    )
                    buffered = 0
                  }
                }
              }),
            )

            if (buffered > 0) {
              parts.push(
                yield* Effect.tryPromise({
                  try: () =>
                    multipart.uploadPart(
                      parts.length + 1,
                      buffer.subarray(0, buffered),
                    ),
                  catch: storageFailure,
                }).pipe(Effect.uninterruptible),
              )
            }

            return yield* Effect.tryPromise({
              try: () => multipart.complete(parts),
              catch: storageFailure,
            }).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  completed = true
                }),
              ),
              Effect.uninterruptible,
            )
          }).pipe(Effect.scoped)

          if (!stored) return yield* Effect.fail(storageFailure())

          const value = yield* Schema.decodeUnknownEffect(Media)({
            id,
            workspaceId,
            name: safeName,
            mediaType: type,
            kind: type.startsWith("image/") ? "image" : "video",
            bytes: yield* Ref.get(size),
            url: `/media/${encodeURIComponent(id)}`,
          }).pipe(
            Effect.mapError(
              () =>
                new ApiError({
                  code: "invalid-input",
                  message: "Invalid media metadata.",
                }),
            ),
          )

          // Wait for the write before cleanup can decide whether the object is linked.
          yield* mediaDb.saveMedia({ ...value, objectKey }).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                linked = true
              }),
            ),
            Effect.uninterruptible,
          )

          return value
        }),
      ).pipe(
        Effect.timeoutOrElse({
          duration: "2 minutes",
          orElse: () =>
            Effect.fail(
              new ApiError({
                code: "upstream-failure",
                message: "The media upload timed out.",
              }),
            ),
        }),
      )
    }

    function serve(objectKey: string, request: Request) {
      return Effect.gen(function* () {
        const metadata = yield* Effect.tryPromise({
          try: () => bindings.MEDIA.head(objectKey),
          catch: storageFailure,
        })

        if (!metadata)
          return yield* Effect.fail(
            new ApiError({ code: "not-found", message: "Media not found." }),
          )
        const selected = byteRange(request.headers.get("range"), metadata.size)

        const headers = new Headers({
          "content-type":
            metadata.httpMetadata?.contentType ?? "application/octet-stream",
          "cache-control": "private, no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "accept-ranges": "bytes",
          etag: metadata.httpEtag,
        })

        if (!selected.valid) {
          headers.set("content-range", `bytes */${metadata.size}`)

          return new Response(null, { status: 416, headers })
        }

        const range = selected.range
        headers.set("content-length", String(range?.length ?? metadata.size))

        if (range)
          headers.set(
            "content-range",
            `bytes ${range.offset}-${range.offset + range.length - 1}/${metadata.size}`,
          )
        const status = range ? 206 : 200

        if (request.method === "HEAD")
          return new Response(null, { status, headers })

        const object = yield* Effect.tryPromise({
          try: () =>
            bindings.MEDIA.get(objectKey, range ? { range } : undefined),
          catch: storageFailure,
        })

        if (!object || !("body" in object))
          return yield* Effect.fail(
            new ApiError({ code: "not-found", message: "Media not found." }),
          )

        const responseBody = yield* Schema.decodeUnknownEffect(WebBody)(
          object.body,
        ).pipe(Effect.mapError(storageFailure))

        return new Response(responseBody, { status, headers })
      })
    }

    function download(userId: string, id: string, request: Request) {
      return mediaDb
        .mediaById({ userId, mediaId: id })
        .pipe(Effect.flatMap((value) => serve(value.objectKey, request)))
    }

    function publicDownload(token: string, request: Request) {
      return Effect.gen(function* () {
        const value = yield* secrets.decrypt(token).pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.fromJsonString(PublicMediaToken)),
          ),
          Effect.mapError(
            () =>
              new ApiError({ code: "not-found", message: "Media not found." }),
          ),
        )

        const now = yield* DateTime.now

        if (value.expiresAt <= DateTime.toEpochMillis(now)) {
          return yield* Effect.fail(
            new ApiError({ code: "not-found", message: "Media not found." }),
          )
        }

        const media = yield* mediaDb.media({
          workspaceId: value.workspaceId,
          mediaId: value.mediaId,
        })

        return yield* serve(media.objectKey, request)
      })
    }

    function publicMedia(
      userId: string,
      workspaceId: string,
      ids: readonly string[],
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })
        const now = yield* DateTime.now

        return yield* Effect.forEach(
          ids,
          (id) =>
            Effect.gen(function* () {
              const value = yield* mediaDb.media({ workspaceId, mediaId: id })

              const token = yield* secrets.encrypt(
                JSON.stringify({
                  mediaId: id,
                  workspaceId,
                  expiresAt: DateTime.toEpochMillis(now) + 21600000,
                }),
              )

              return {
                ...value,
                url: `${config.APP_ORIGIN}/media/public/${encodeURIComponent(token)}`,
              }
            }),
          { concurrency: 4 },
        )
      })
    }

    function importRemote(
      userId: string,
      workspaceId: string,
      url: string,
      name: string,
      typeHint?: string,
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })
        const opened = yield* egress.open(url)

        const declared =
          opened.response.headers["content-type"]
            ?.split(";")[0]
            ?.trim()
            .toLowerCase() ?? ""

        const type = yield* mediaType(
          !declared || declared === "application/octet-stream"
            ? (typeHint ?? "")
            : declared,
        )

        const readable = yield* Stream.toReadableStreamEffect(
          opened.response.stream,
        )

        return yield* upload(userId, workspaceId, name, type, readable)
      })
    }

    return {
      list: Effect.fn("MediaService.list")(function* (
        userId: string,
        input: typeof MediaListInput.Type,
      ) {
        yield* workspacesDb.workspaceAccess({
          userId,
          workspaceId: input.workspaceId,
        })

        return yield* mediaDb.listMedia(input)
      }),
      upload: gate.wrap(upload),
      download,
      publicDownload,
      publicMedia: gate.wrap(publicMedia),
      importRemote: gate.wrap(importRemote),
    }
  })
}

export class MediaService extends Context.Service<
  MediaService,
  Effect.Success<ReturnType<typeof makeMedia>>
>()("social/MediaService") {}

export function mediaLayer(
  bindings: Pick<WorkerBindings, "MEDIA">,
  config: AppConfig,
) {
  return Layer.effect(MediaService, makeMedia(bindings, config))
}
