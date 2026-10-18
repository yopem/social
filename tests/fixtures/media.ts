import { Effect, Exit, Fiber, Schema } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"
import { MediaService, mediaLayer } from "server/features/media/service"

import { MediaDb } from "db/services/media"
import type { AppConfig } from "env/server"
import { WorkerResources } from "env/server"

import { fixtureError, fixtureJson } from "./auth"

const Fault = Schema.Struct({
  fault: Schema.Literals([
    "part",
    "complete",
    "save",
    "complete-interrupt",
    "put-interrupt",
    "producer",
    "linked-interrupt",
  ]),
})

export function mediaLifetimeFixture(
  request: Request,
  config: AppConfig,
  userId: string,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const { fault } = yield* fixtureJson(request, Fault)
    const resources = yield* WorkerResources
    const mediaDb = yield* MediaDb
    const gate = yield* OperationGate
    const reached = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    let objectKey = ""
    let mediaId = ""
    let aborted = false
    let committed = false
    let deleted = false
    let prematureCleanup = false
    let settled = false
    let failure: { code: string; message: string } | null = null

    async function pauseCommit() {
      committed = true

      if (["complete-interrupt", "put-interrupt"].includes(fault)) {
        reached.resolve()
        await release.promise
      }

      settled = true
    }

    const put: typeof resources.MEDIA.put = async (key, body, options) => {
      objectKey = key
      const result = await resources.MEDIA.put(key, body, options)
      await pauseCommit()

      return result
    }

    const createMultipartUpload: typeof resources.MEDIA.createMultipartUpload =
      async (key, options) => {
        objectKey = key

        const multipart = await resources.MEDIA.createMultipartUpload(
          key,
          options,
        )

        return {
          key: multipart.key,
          uploadId: multipart.uploadId,
          async uploadPart(number, body, options) {
            const result = await multipart.uploadPart(number, body, options)

            if (fault === "part") throw fixtureError("Injected part failure")

            return result
          },
          async complete(parts) {
            if (fault === "complete")
              throw fixtureError("Injected completion failure")
            const result = await multipart.complete(parts)
            await pauseCommit()

            return result
          },
          async abort() {
            if (committed && !settled) prematureCleanup = true
            await multipart.abort()
            aborted = true
          },
        }
      }

    const remove: typeof resources.MEDIA.delete = async (keys) => {
      if (committed && !settled) prematureCleanup = true
      await resources.MEDIA.delete(keys)
      deleted = true
    }

    const bucket: typeof resources.MEDIA = {
      head: resources.MEDIA.head.bind(resources.MEDIA),
      get: resources.MEDIA.get.bind(resources.MEDIA),
      list: resources.MEDIA.list.bind(resources.MEDIA),
      resumeMultipartUpload: resources.MEDIA.resumeMultipartUpload.bind(
        resources.MEDIA,
      ),
      put,
      createMultipartUpload,
      delete: remove,
    }

    const saveMedia: typeof mediaDb.saveMedia = (value) => {
      mediaId = value.id

      if (fault === "save")
        return Effect.fail(fixtureError("Injected save failure"))

      return mediaDb.saveMedia(value).pipe(
        Effect.andThen(
          fault === "linked-interrupt"
            ? Effect.tryPromise({
                try: async () => {
                  reached.resolve()
                  await release.promise
                },
                catch: () => fixtureError("Fixture save barrier failed"),
              })
            : Effect.void,
        ),
      )
    }

    // Keep the real activity guard but allow a controlled request interruption.
    function wrap<Args extends readonly unknown[], A, E, R>(
      operation: (
        userId: string,
        workspaceId: string,
        ...args: Args
      ) => Effect.Effect<A, E, R>,
    ) {
      return gate.wrap<Args, A, E, R>((userId, workspaceId, ...args) =>
        operation(userId, workspaceId, ...args).pipe(Effect.interruptible),
      )
    }

    const service = yield* MediaService.pipe(
      Effect.provide(mediaLayer({ MEDIA: bucket }, config)),
      Effect.provideService(MediaDb, { ...mediaDb, saveMedia }),
      Effect.provideService(OperationGate, { ...gate, wrap }),
    )

    const bytes = new Uint8Array(5 * 1024 * 1024 + 37)
    bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
    let sent = false

    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!sent) {
          controller.enqueue(bytes)
          sent = true
        } else if (fault === "producer") {
          controller.error(fixtureError("Injected producer failure"))
        } else {
          controller.close()
        }
      },
    })

    const upload = service
      .upload(
        userId,
        workspaceId,
        "lifetime.png",
        "image/png",
        body,
        ["put-interrupt", "producer"].includes(fault)
          ? bytes.length
          : undefined,
      )
      .pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            failure = { code: error.code, message: error.message }
          }),
        ),
      )

    const exit = yield* Effect.scoped(
      Effect.gen(function* () {
        const fiber = yield* upload.pipe(Effect.forkScoped)

        if (fault.endsWith("-interrupt")) {
          yield* Effect.raceFirst(
            Effect.tryPromise({
              try: () => reached.promise,
              catch: () => fixtureError("Fixture commit barrier failed"),
            }),
            Fiber.await(fiber).pipe(
              Effect.andThen(
                Effect.fail(fixtureError("Upload ended before commit barrier")),
              ),
            ),
          )
          yield* Effect.sync(() => fiber.interruptUnsafe())
          yield* Effect.yieldNow
          release.resolve()
        }

        return yield* Fiber.await(fiber)
      }).pipe(Effect.ensuring(Effect.sync(() => release.resolve()))),
    )

    const object = objectKey
      ? yield* Effect.tryPromise({
          try: () => resources.MEDIA.head(objectKey),
          catch: () => fixtureError("Fixture object check failed"),
        })
      : null

    const linked = mediaId
      ? yield* mediaDb.media({ workspaceId, mediaId }).pipe(
          Effect.as(true),
          Effect.catchTag("ApiError", (error) =>
            error.code === "not-found"
              ? Effect.succeed(false)
              : Effect.fail(error),
          ),
        )
      : false

    if (prematureCleanup)
      return yield* fixtureError("Cleanup ran before native commit settled")

    return Response.json({
      failed: Exit.isFailure(exit),
      aborted,
      objectPresent: object !== null,
      linked,
      committed,
      deleted,
      error: failure,
    })
  })
}

export function mediaRemoteFixture(userId: string, workspaceId: string) {
  return Effect.gen(function* () {
    const media = yield* MediaService

    return Response.json(
      yield* media.importRemote(
        userId,
        workspaceId,
        "https://fixtures.example.test/image.png",
        "remote.png",
        "image/png",
      ),
    )
  })
}
