import { sql, eq, and, notExists } from "drizzle-orm"
import { Context, Effect, Layer, Schema, Struct } from "effect"

import { feeds, feedItems, FeedRow } from "db/schema/feeds"
import { media, MediaRow } from "db/schema/media"
import { posts } from "db/schema/posts"
import { ChannelsDb, type createChannelsRepository } from "db/services/channels"
import { Database } from "db/services/client"
import type { DatabaseContext } from "db/services/context"
import { failure, now } from "db/services/context"
import { PostsDb, type createPostsRepository } from "db/services/posts"
import { validateOperation } from "db/services/validation"
import { Feed, FeedInput } from "rpc/contracts/feeds"
import { PostContent } from "rpc/contracts/posts"

const FeedSaveInput = Schema.Struct({
  workspaceId: Schema.String,
  config: Schema.Struct(
    Struct.omit(Feed.fields, ["id", "workspaceId", "lastCheckedAt", "error"]),
  ),
  feedId: Schema.optional(Schema.String),
})

const FeedImportInput = Schema.Struct({
  workspaceId: Schema.String,
  feedId: Schema.String,
  itemKey: Schema.String,
  content: PostContent,
  reviewReason: Schema.optional(Schema.String),
})

const FeedItemLookupInput = Schema.Struct({
  workspaceId: Schema.String,
  feedId: Schema.String,
  itemKey: Schema.String,
})

const FeedItemClaimInput = Schema.Struct({
  feedId: Schema.String,
  itemKey: Schema.String,
})

const FeedCheckInput = Schema.Struct({
  workspaceId: Schema.String,
  feedId: Schema.String,
  error: Schema.NullOr(Schema.String),
})

export class FeedsDb extends Context.Service<
  FeedsDb,
  ReturnType<typeof createFeedsRepository>
>()("social/FeedsDb") {
  static readonly layer = Layer.effect(
    FeedsDb,
    Effect.gen(function* () {
      const context = yield* Database
      const channelsRepository = yield* ChannelsDb
      const postsRepository = yield* PostsDb

      return createFeedsRepository(context, channelsRepository, postsRepository)
    }),
  )
}

export function createFeedsRepository(
  context: DatabaseContext,
  channelsRepository: ReturnType<typeof createChannelsRepository>,
  postsRepository: ReturnType<typeof createPostsRepository>,
) {
  const { client, query, write, batch, required } = context
  const { channel } = channelsRepository
  const { getPost } = postsRepository

  function getFeed({ workspaceId, feedId: id }: typeof FeedInput.Type) {
    return query(FeedRow, () =>
      client
        .select({ data: feeds.data })
        .from(feeds)
        .where(and(eq(feeds.workspace_id, workspaceId), eq(feeds.id, id))),
    ).pipe(
      Effect.flatMap(required),
      Effect.map((row) => row.data),
    )
  }

  const feedOperations = {
    getFeed,
    listFeeds(this: void, workspaceId: string) {
      return query(FeedRow, () =>
        client
          .select({ data: feeds.data })
          .from(feeds)
          .where(eq(feeds.workspace_id, workspaceId))
          .orderBy(feeds.id)
          .limit(100),
      ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
    },
    saveFeed: Effect.fn("feeds.saveFeed")(function* ({
      workspaceId,
      config,
      feedId,
    }: typeof FeedSaveInput.Type) {
      const old = feedId ? yield* getFeed({ workspaceId, feedId }) : null

      const value = yield* Schema.decodeUnknownEffect(Feed)({
        ...config,
        id: feedId ?? crypto.randomUUID(),
        workspaceId,
        lastCheckedAt: old?.lastCheckedAt ?? null,
        error: old?.error ?? null,
      }).pipe(Effect.mapError(() => failure("invalid-input", "Invalid feed")))

      for (const id of value.channelIds)
        yield* channel({ workspaceId, channelId: id })
      yield* write(() =>
        client
          .insert(feeds)
          .values({
            id: value.id,
            workspace_id: workspaceId,
            data: JSON.stringify(value),
            last_checked_at: value.lastCheckedAt,
          })
          .onConflictDoUpdate({
            target: feeds.id,
            set: { data: JSON.stringify(value) },
            setWhere: sql`${feeds.workspace_id}=${workspaceId}`,
          }),
      )

      return value
    }),
    deleteFeed(this: void, { workspaceId, feedId: id }: typeof FeedInput.Type) {
      return write(() =>
        client
          .delete(feeds)
          .where(and(eq(feeds.workspace_id, workspaceId), eq(feeds.id, id))),
      )
    },
    importFeedPost: Effect.fn("feeds.importFeedPost")(function* ({
      workspaceId,
      feedId,
      itemKey,
      content,
      reviewReason,
    }: typeof FeedImportInput.Type) {
      yield* getFeed({ workspaceId, feedId })

      const valid = yield* Schema.decodeUnknownEffect(PostContent)(
        content,
      ).pipe(
        Effect.mapError(() =>
          failure("invalid-input", "Invalid imported post"),
        ),
      )

      for (const id of valid.channelIds)
        yield* channel({ workspaceId, channelId: id })

      for (const override of valid.overrides)
        if (!valid.channelIds.includes(override.channelId))
          return yield* Effect.fail(
            failure("invalid-input", "Override must target a selected channel"),
          )

      for (const id of valid.mediaIds)
        yield* query(MediaRow, () =>
          client
            .select({ data: media.data, object_key: media.object_key })
            .from(media)
            .where(and(eq(media.workspace_id, workspaceId), eq(media.id, id))),
        ).pipe(Effect.flatMap(required))
      const postId = crypto.randomUUID()
      const stamp = yield* now()
      yield* batch([
        client.insert(posts).select(
          client
            .select({
              id: sql<string>`${postId}`.as("id"),
              workspace_id: feeds.workspace_id,
              content: sql<string>`${JSON.stringify(valid)}`.as("content"),
              state: sql<string>`${reviewReason ? "needs-review" : "draft"}`.as(
                "state",
              ),
              scheduled_at: sql<string | null>`NULL`.as("scheduled_at"),
              created_at: sql<string>`${stamp}`.as("created_at"),
              updated_at: sql<string>`${stamp}`.as("updated_at"),
              review_reason: sql<string | null>`${reviewReason ?? null}`.as(
                "review_reason",
              ),
              operation_key: sql<string | null>`NULL`.as("operation_key"),
              lease_until: sql<string | null>`NULL`.as("lease_until"),
              dispatch_status: sql<string | null>`NULL`.as("dispatch_status"),
            })
            .from(feeds)
            .where(
              and(
                eq(feeds.id, feedId),
                eq(feeds.workspace_id, workspaceId),
                notExists(
                  client
                    .select()
                    .from(feedItems)
                    .where(
                      and(
                        eq(feedItems.feed_id, feedId),
                        eq(feedItems.item_key, itemKey),
                      ),
                    ),
                ),
              ),
            ),
        ),
        client
          .insert(feedItems)
          .select(
            client
              .select({
                feed_id: sql<string>`${feedId}`.as("feed_id"),
                item_key: sql<string>`${itemKey}`.as("item_key"),
                claimed_at: sql<string>`${stamp}`.as("claimed_at"),
                post_id: posts.id,
              })
              .from(posts)
              .where(eq(posts.id, postId)),
          )
          .onConflictDoNothing({
            target: [feedItems.feed_id, feedItems.item_key],
          }),
      ])

      const item = yield* query(
        Schema.Struct({ post_id: Schema.NullOr(Schema.String) }),
        () =>
          client
            .select({ post_id: feedItems.post_id })
            .from(feedItems)
            .innerJoin(feeds, eq(feeds.id, feedItems.feed_id))
            .where(
              and(
                eq(feeds.workspace_id, workspaceId),
                eq(feedItems.feed_id, feedId),
                eq(feedItems.item_key, itemKey),
              ),
            ),
      ).pipe(Effect.flatMap(required))

      if (!item.post_id) return { post: null, created: false }

      return {
        post: yield* getPost({ workspaceId, postId: item.post_id }),
        created: item.post_id === postId,
      }
    }),
    findImportedPost(
      this: void,
      { workspaceId, feedId, itemKey }: typeof FeedItemLookupInput.Type,
    ) {
      return query(
        Schema.Struct({ post_id: Schema.NullOr(Schema.String) }),
        () =>
          client
            .select({ post_id: feedItems.post_id })
            .from(feedItems)
            .innerJoin(feeds, eq(feeds.id, feedItems.feed_id))
            .where(
              and(
                eq(feeds.workspace_id, workspaceId),
                eq(feedItems.feed_id, feedId),
                eq(feedItems.item_key, itemKey),
              ),
            ),
      ).pipe(
        Effect.flatMap((rows) =>
          Effect.gen(function* () {
            const row = rows[0]

            if (!row) return null

            const post = row.post_id
              ? yield* getPost({ workspaceId, postId: row.post_id })
              : null

            return { post }
          }),
        ),
      )
    },
    claimFeedItem: Effect.fn("feeds.claimFeedItem")(function* ({
      feedId,
      itemKey,
    }: typeof FeedItemClaimInput.Type) {
      const stamp = yield* now()

      return yield* query(Schema.Struct({ item_key: Schema.String }), () =>
        client
          .insert(feedItems)
          .values({ feed_id: feedId, item_key: itemKey, claimed_at: stamp })
          .onConflictDoNothing()
          .returning({ item_key: feedItems.item_key }),
      ).pipe(Effect.map((rows) => rows.length === 1))
    }),
    listDueFeeds: Effect.fn("feeds.listDueFeeds")(function* (limit: number) {
      const cutoff = yield* now(-900000)

      return yield* query(FeedRow, () =>
        client
          .select({ data: feeds.data })
          .from(feeds)
          .where(
            sql`json_extract(data,'$.enabled')=1 AND (last_checked_at IS NULL OR last_checked_at<${cutoff})`,
          )
          .orderBy(feeds.last_checked_at)
          .limit(Math.max(1, Math.min(100, Math.floor(limit)))),
      ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
    }),
    recordFeedCheck: Effect.fn("feeds.recordFeedCheck")(function* ({
      workspaceId,
      feedId: id,
      error,
    }: typeof FeedCheckInput.Type) {
      const stamp = yield* now()

      return yield* write(() =>
        client
          .update(feeds)
          .set({
            data: sql`json_set(data,'$.lastCheckedAt',${stamp},'$.error',${error})`,
            last_checked_at: sql`${stamp}`,
          })
          .where(and(eq(feeds.workspace_id, workspaceId), eq(feeds.id, id))),
      )
    }),
  }

  return {
    getFeed: validateOperation(
      feedOperations.getFeed,
      Schema.Tuple([FeedInput]),
    ),
    listFeeds: validateOperation(
      feedOperations.listFeeds,
      Schema.Tuple([Schema.String]),
    ),
    saveFeed: validateOperation(
      feedOperations.saveFeed,
      Schema.Tuple([FeedSaveInput]),
    ),
    deleteFeed: validateOperation(
      feedOperations.deleteFeed,
      Schema.Tuple([FeedInput]),
    ),
    importFeedPost: validateOperation(
      feedOperations.importFeedPost,
      Schema.Tuple([FeedImportInput]),
    ),
    findImportedPost: validateOperation(
      feedOperations.findImportedPost,
      Schema.Tuple([FeedItemLookupInput]),
    ),
    claimFeedItem: validateOperation(
      feedOperations.claimFeedItem,
      Schema.Tuple([FeedItemClaimInput]),
    ),
    listDueFeeds: validateOperation(
      feedOperations.listDueFeeds,
      Schema.Tuple([Schema.Number]),
    ),
    recordFeedCheck: validateOperation(
      feedOperations.recordFeedCheck,
      Schema.Tuple([FeedCheckInput]),
    ),
  }
}
