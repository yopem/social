import { Context, Effect, Layer, Either, Schema } from "effect"
import { XMLParser, XMLValidator } from "fast-xml-parser"
import { Egress, publicUrl, readBounded } from "server/lib/egress"
import { SocialService } from "server/services/social"
import { MediaService } from "server/storage/media"

import { CredentialCrypto } from "auth/services/crypto"
import { CoreDb } from "db/services/core"
import type { JobMessage } from "env/server"
import { WorkerResources } from "env/server"
import type { Feed, PostContent } from "rpc/contracts/models"
import { ApiError } from "rpc/contracts/models"

const XmlLimit = 2_000_000

const BatchSize = 5

const Entry = Schema.Struct({
  identity: Schema.String,
  title: Schema.String,
  link: Schema.String,
  media: Schema.Array(
    Schema.Struct({ url: Schema.String, type: Schema.String }),
  ),
})

type Cursor = Extract<JobMessage, { type: "feed" }>["cursor"]

type FeedConfig = Omit<Feed, "id" | "workspaceId" | "lastCheckedAt" | "error">

function invalid(message: string) {
  return new ApiError({ code: "invalid-input", message })
}

type XmlValue = string | XmlObject | readonly XmlValue[]

interface XmlObject {
  readonly [key: string]: XmlValue
}

const XmlValue: Schema.Schema<XmlValue> = Schema.suspend(() =>
  Schema.Union(Schema.String, XmlObject, Schema.Array(XmlValue)),
)

const XmlObject: Schema.Schema<XmlObject> = Schema.Record({
  key: Schema.String,
  value: XmlValue,
})

function record(value: XmlValue | undefined): XmlObject {
  return Schema.is(XmlObject)(value) ? value : {}
}

function array(value: XmlValue | undefined): readonly XmlValue[] {
  return value === undefined
    ? []
    : Schema.is(Schema.Array(XmlValue))(value)
      ? value
      : [value]
}

function text(value: XmlValue | undefined): string {
  const result = Schema.is(Schema.String)(value)
    ? value
    : record(value)["#text"]

  return Schema.is(Schema.String)(result) ? result.trim() : ""
}

function resolveLink(value: string, base: string) {
  return Effect.try({
    try: () => new URL(value, base),
    catch: () => invalid("Feed contains an invalid URL."),
  }).pipe(
    Effect.filterOrFail(
      (url) =>
        ["https:", "http:"].includes(url.protocol) &&
        !url.username &&
        !url.password,
      () => invalid("Feed contains an invalid article URL."),
    ),
    Effect.flatMap((url) =>
      publicUrl(
        url.protocol === "http:"
          ? url.href.replace(/^http:/, "https:")
          : url.href,
      ).pipe(Effect.as(url.href)),
    ),
  )
}

function parse(xml: string, base: string, name: string) {
  return Effect.gen(function* () {
    if (/<!\s*(DOCTYPE|ENTITY)/i.test(xml))
      return yield* Effect.fail(
        invalid("Feed XML declarations are not permitted."),
      )

    const document: unknown = yield* Effect.try({
      try: () => {
        if (XMLValidator.validate(xml) !== true) throw new Error("Invalid XML")

        return new XMLParser({
          ignoreAttributes: false,
          parseTagValue: false,
          processEntities: false,
          maxNestedTags: 50,
        }).parse(xml)
      },
      catch: () => invalid("Feed XML is invalid."),
    })

    const root = yield* Schema.decodeUnknown(XmlObject)(document).pipe(
      Effect.mapError(() => invalid("Feed XML is invalid.")),
    )

    const rss = record(record(root.rss).channel)
    const atom = record(root.feed)

    if (!root.rss && !root.feed)
      return yield* Effect.fail(invalid("Use an RSS or Atom feed."))

    return yield* Effect.forEach(
      array(root.rss ? rss.item : atom.entry),
      (raw) =>
        Effect.gen(function* () {
          const item = record(raw)
          const links = array(item.link)

          const alternate = links.find(
            (link) =>
              !record(link)["@_rel"] || record(link)["@_rel"] === "alternate",
          )

          const linkValue = text(record(alternate)["@_href"]) || text(alternate)
          const link = linkValue ? yield* resolveLink(linkValue, base) : ""

          const enclosures = [
            ...array(item.enclosure),
            ...array(item["media:content"]),
            ...array(item["media:thumbnail"]),
            ...array(record(item["media:group"])["media:content"]),
            ...links.filter((value) => record(value)["@_rel"] === "enclosure"),
          ]

          const media = yield* Effect.forEach(enclosures, (value) =>
            Effect.gen(function* () {
              const enclosure = record(value)
              const url = text(enclosure["@_url"]) || text(enclosure["@_href"])

              const type =
                text(enclosure["@_type"]) || text(enclosure["@_medium"])

              if (!url) return null

              return { url: yield* resolveLink(url, base), type }
            }),
          )

          return yield* Schema.decodeUnknown(Entry)({
            identity:
              text(item.guid) || text(item.id) || link || JSON.stringify(raw),
            title:
              text(item.title)
                .replace(/<[^>]*>/g, "")
                .trim() || name,
            link,
            media: media.filter((value) => value !== null),
          }).pipe(Effect.mapError(() => invalid("Feed entry is invalid.")))
        }),
    )
  })
}

function makeFeeds() {
  return Effect.gen(function* () {
    const db = yield* CoreDb
    const cryptoService = yield* CredentialCrypto
    const egress = yield* Egress
    const media = yield* MediaService
    const social = yield* SocialService
    const resources = yield* WorkerResources

    function send(message: JobMessage) {
      return Effect.tryPromise({
        try: () => resources.JOBS.send(message),
        catch: () =>
          new ApiError({
            code: "upstream-failure",
            message: "Feed work could not be queued.",
          }),
      })
    }

    function discard(workspaceId: string, ids: readonly string[]) {
      return Effect.forEach(
        ids,
        (id) =>
          db.deleteUnusedMedia(workspaceId, id).pipe(
            Effect.flatMap((value) =>
              value
                ? Effect.tryPromise({
                    try: () => resources.MEDIA.delete(value.objectKey),
                    catch: () =>
                      new ApiError({
                        code: "storage-failure",
                        message: "Unused feed media could not be removed.",
                      }),
                  })
                : Effect.void,
            ),
          ),
        { discard: true },
      )
    }

    function revision(feed: Feed) {
      const { lastCheckedAt: _checked, error: _error, ...config } = feed

      return cryptoService.hash(JSON.stringify(config))
    }

    function refresh(
      userId: string,
      workspaceId: string,
      feedId: string,
      cursor?: Cursor,
    ) {
      return Effect.scoped(
        Effect.gen(function* () {
          yield* db.workspaceAccess(userId, workspaceId)
          const feed = yield* db.getFeed(workspaceId, feedId)
          const currentRevision = yield* revision(feed)

          if (
            cursor &&
            (!feed.enabled || cursor.revision !== currentRevision)
          ) {
            yield* Effect.tryPromise({
              try: () =>
                resources.MEDIA.delete(
                  `feed-snapshots/${workspaceId}/${feedId}/${cursor.snapshotId}`,
                ),
              catch: () =>
                new ApiError({
                  code: "storage-failure",
                  message: "Stale feed snapshot could not be removed.",
                }),
            })

            return { imported: 0 }
          }

          const key = `feed-snapshots/${workspaceId}/${feedId}/${cursor?.snapshotId ?? crypto.randomUUID()}`
          const snapshotId = key.split("/").at(-1) ?? ""
          let xml: string
          let base = feed.url

          if (cursor) {
            const snapshot = yield* Effect.tryPromise({
              try: () => resources.MEDIA.get(key),
              catch: () =>
                new ApiError({
                  code: "storage-failure",
                  message: "Feed snapshot could not be read.",
                }),
            })

            if (!snapshot) return { imported: 0 }

            if (snapshot.size > XmlLimit)
              return yield* Effect.fail(
                invalid("Feed snapshot exceeds the size limit."),
              )
            xml = yield* Effect.tryPromise({
              try: () => snapshot.text(),
              catch: () => invalid("Feed snapshot could not be read."),
            })
            base = snapshot.customMetadata?.base ?? base
          } else {
            const opened = yield* egress.open(feed.url)
            const bytes = yield* readBounded(opened.response, XmlLimit)
            xml = yield* Effect.try({
              try: () =>
                new TextDecoder("utf-8", { fatal: true }).decode(bytes),
              catch: () => invalid("Feed encoding is invalid."),
            })
            base = opened.url
          }

          const entries = yield* parse(xml, base, feed.name)
          const offset = cursor?.offset ?? 0
          let imported = 0

          for (const entry of entries.slice(offset, offset + BatchSize)) {
            const itemKey = yield* cryptoService.hash(entry.identity)

            const existing = yield* db.findImportedPost(
              workspaceId,
              feedId,
              itemKey,
            )

            if (existing) {
              // Queue retries must recover a durable draft after a failed send.
              if (feed.mode === "automatic" && existing.state === "draft")
                yield* send({
                  type: "publish",
                  workspaceId,
                  postId: existing.id,
                  operationKey: `rss:${existing.id}`,
                })
              continue
            }

            const ids: string[] = []
            yield* Effect.gen(function* () {
              let reason: string | undefined

              for (const enclosure of entry.media) {
                const image =
                  enclosure.type.startsWith("image") ||
                  /\.(png|jpe?g|gif|webp)(\?|$)/i.test(enclosure.url)

                const video =
                  enclosure.type.startsWith("video") ||
                  /\.(mp4|mov|webm)(\?|$)/i.test(enclosure.url)

                if (
                  (image && !feed.includeImages) ||
                  (video && !feed.includeVideos) ||
                  (!image &&
                    !video &&
                    !feed.includeImages &&
                    !feed.includeVideos)
                )
                  continue

                if (ids.length >= 20) {
                  reason =
                    "Feed has too many media files. Review media before publishing."
                  break
                }

                const file = yield* media
                  .importRemote(
                    userId,
                    workspaceId,
                    enclosure.url,
                    entry.title.slice(0, 500),
                    enclosure.type.includes("/") ? enclosure.type : undefined,
                  )
                  .pipe(
                    Effect.catchAll((error) => {
                      if (
                        ["storage-failure", "upstream-failure"].includes(
                          error.code,
                        )
                      )
                        return Effect.fail(error)
                      reason = error.message

                      return Effect.succeed(null)
                    }),
                  )

                if (file) {
                  if (
                    (file.kind === "image" && !feed.includeImages) ||
                    (file.kind === "video" && !feed.includeVideos)
                  ) {
                    yield* discard(workspaceId, [file.id])
                  } else ids.push(file.id)
                }
              }

              const content: PostContent = {
                text: `${entry.title}${entry.link ? `\n${entry.link}` : ""}`,
                mediaIds: ids,
                channelIds: feed.channelIds,
                overrides: [],
              }

              const latest = yield* db.getFeed(workspaceId, feedId)

              if ((yield* revision(latest)) !== currentRevision)
                return yield* Effect.fail(
                  new ApiError({
                    code: "conflict",
                    message:
                      "Feed settings changed during import. Refresh again.",
                  }),
                )

              const result = yield* db.importFeedPost(
                workspaceId,
                feedId,
                itemKey,
                content,
                reason,
              )

              if (!result.created) {
                yield* discard(workspaceId, ids)

                return
              }

              imported++

              if (feed.mode === "automatic" && !reason) {
                const prepared = yield* media
                  .publicMedia(userId, workspaceId, ids)
                  .pipe(
                    Effect.flatMap((files) =>
                      social.prepare(userId, workspaceId, result.post, files),
                    ),
                    Effect.either,
                  )

                if (Either.isLeft(prepared)) {
                  if (
                    ["upstream-failure", "storage-failure"].includes(
                      prepared.left.code,
                    )
                  )
                    return yield* Effect.fail(prepared.left)
                  yield* db.holdPost(
                    workspaceId,
                    result.post.id,
                    prepared.left.message,
                  )
                } else
                  yield* send({
                    type: "publish",
                    workspaceId,
                    postId: result.post.id,
                    operationKey: `rss:${result.post.id}`,
                  })
              }
            }).pipe(
              Effect.onError(() =>
                discard(workspaceId, ids).pipe(
                  Effect.catchAll(() =>
                    Effect.logError("Unused feed media cleanup failed."),
                  ),
                ),
              ),
            )
          }

          if (offset + BatchSize < entries.length) {
            if (!cursor)
              yield* Effect.tryPromise({
                try: () =>
                  resources.MEDIA.put(key, xml, { customMetadata: { base } }),
                catch: () =>
                  new ApiError({
                    code: "storage-failure",
                    message: "Feed snapshot could not be saved.",
                  }),
              })
            yield* send({
              type: "feed",
              workspaceId,
              feedId,
              cursor: {
                snapshotId,
                offset: offset + BatchSize,
                revision: currentRevision,
              },
            })
          } else {
            if (cursor)
              yield* Effect.tryPromise({
                try: () => resources.MEDIA.delete(key),
                catch: () =>
                  new ApiError({
                    code: "storage-failure",
                    message: "Feed snapshot could not be removed.",
                  }),
              })
            yield* db.recordFeedCheck(workspaceId, feedId, null)
          }

          return { imported }
        }),
      ).pipe(
        Effect.tapError((error) =>
          error.code === "forbidden"
            ? Effect.void
            : db.recordFeedCheck(workspaceId, feedId, error.message),
        ),
      )
    }

    return {
      list(userId: string, workspaceId: string) {
        return db
          .workspaceAccess(userId, workspaceId)
          .pipe(Effect.zipRight(db.listFeeds(workspaceId)))
      },
      save(
        userId: string,
        workspaceId: string,
        config: FeedConfig,
        feedId?: string,
      ) {
        return Effect.gen(function* () {
          yield* db.workspaceAccess(userId, workspaceId)
          const url = yield* publicUrl(config.url)

          if (config.mode === "automatic" && !config.channelIds.length)
            return yield* Effect.fail(
              invalid("Select a channel for automatic publishing."),
            )

          for (const id of config.channelIds) {
            const channel = yield* db.channel(workspaceId, id)

            if (config.mode === "automatic" && channel.status !== "connected")
              return yield* Effect.fail(
                invalid("Select connected channels for automatic publishing."),
              )
          }

          return yield* db.saveFeed(
            workspaceId,
            { ...config, url: url.href },
            feedId,
          )
        })
      },
      refresh,
      refreshJob(workspaceId: string, feedId: string, cursor?: Cursor) {
        return Effect.gen(function* () {
          const owner = yield* db.automationPrincipal(workspaceId)
          const feed = yield* db.getFeed(workspaceId, feedId)

          return feed.enabled || cursor
            ? yield* refresh(owner.id, workspaceId, feedId, cursor)
            : { imported: 0 }
        })
      },
      remove(userId: string, workspaceId: string, id: string) {
        return db
          .workspaceAccess(userId, workspaceId)
          .pipe(Effect.zipRight(db.deleteFeed(workspaceId, id)))
      },
    }
  })
}

export class FeedService extends Context.Tag("social/FeedService")<
  FeedService,
  Effect.Effect.Success<ReturnType<typeof makeFeeds>>
>() {}

export const feedLayer = Layer.effect(FeedService, makeFeeds())
