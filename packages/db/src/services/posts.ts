import {
  sql,
  eq,
  and,
  lt,
  lte,
  isNull,
  isNotNull,
  inArray,
  desc,
  or,
  gte,
} from "drizzle-orm"
import { DateTime, Effect, Match, Option, Schema } from "effect"

import { channels } from "db/schema/channels"
import { media, MediaRow } from "db/schema/media"
import { posts, deliveries, DeliveryRow, PostRow } from "db/schema/posts"
import type { createChannelsRepository } from "db/services/channels"
import type { CoreContext } from "db/services/core"
import { failure, now } from "db/services/core"
import { validateOperation } from "db/services/validation"
import { PostListPageInput, PostListPageResult } from "rpc/contracts/posts"
import type { Post } from "rpc/contracts/posts"
import { Delivery, PostContent, PostState } from "rpc/contracts/posts"

export function createPostsRepository(
  context: CoreContext,
  channelsRepository: ReturnType<typeof createChannelsRepository>,
) {
  const { client, query, write, required } = context
  const { channel } = channelsRepository

  const publicationOperation = Effect.fnUntraced(function* (
    workspaceId: string,
    id: string,
  ) {
    return yield* query(
      Schema.Struct({
        state: PostState,
        operation_key: Schema.NullOr(Schema.String),
        dispatch_status: Schema.NullOr(Schema.String),
      }),
      () =>
        client
          .select({
            state: posts.state,
            operation_key: posts.operation_key,
            dispatch_status: posts.dispatch_status,
          })
          .from(posts)
          .where(and(eq(posts.workspace_id, workspaceId), eq(posts.id, id))),
    ).pipe(Effect.flatMap(required))
  })

  const getPost = Effect.fnUntraced(function* (
    workspaceId: string,
    id: string,
  ) {
    const row = yield* query(PostRow, () =>
      client
        .select()
        .from(posts)
        .where(and(eq(posts.workspace_id, workspaceId), eq(posts.id, id))),
    ).pipe(Effect.flatMap(required))

    const storedDeliveries = yield* query(DeliveryRow, () =>
      client
        .select({ data: deliveries.data })
        .from(deliveries)
        .where(eq(deliveries.post_id, id))
        .orderBy(deliveries.id)
        .limit(40),
    )

    return {
      id: row.id,
      workspaceId: row.workspace_id,
      content: row.content,
      state: row.state,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      reviewReason: row.review_reason,
      deliveries: storedDeliveries.map((item) => item.data),
    }
  })

  const operations = {
    getPost,
    publicationOperation,
    listPosts(
      this: void,
      workspaceId: string,
      filter: "all" | "draft" | "queue" | "sent",
    ) {
      const states = Match.value(filter).pipe(
        Match.when("draft", () =>
          inArray(posts.state, ["draft", "needs-review"]),
        ),
        Match.when("queue", () =>
          inArray(posts.state, ["scheduled", "pending"]),
        ),
        Match.when("sent", () =>
          inArray(posts.state, ["published", "partial", "failed"]),
        ),
        Match.orElse(() => undefined),
      )

      return query(Schema.Struct({ id: Schema.String }), () =>
        client
          .select({ id: posts.id })
          .from(posts)
          .where(and(eq(posts.workspace_id, workspaceId), states))
          .orderBy(desc(posts.created_at))
          .limit(100),
      ).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => getPost(workspaceId, row.id), {
            concurrency: 4,
          }),
        ),
      )
    },
    listPostsPage: Effect.fn("core.listPostsPage")(function* (
      input: typeof PostListPageInput.Type,
    ) {
      const value = yield* Schema.decodeUnknownEffect(PostListPageInput)(
        input,
      ).pipe(
        Effect.mapError(() => failure("invalid-input", "Invalid post page")),
      )

      const states = Match.value(value.filter).pipe(
        Match.when("draft", () =>
          inArray(posts.state, ["draft", "needs-review"]),
        ),
        Match.when("queue", () =>
          inArray(posts.state, ["scheduled", "pending"]),
        ),
        Match.when("sent", () =>
          inArray(posts.state, ["published", "partial", "failed"]),
        ),
        Match.when("calendar", () =>
          or(isNotNull(posts.scheduled_at), eq(posts.state, "cancelled")),
        ),
        Match.orElse(() => undefined),
      )

      const limit = value.limit ?? 50

      const rows = yield* query(PostRow, () =>
        client
          .select()
          .from(posts)
          .where(
            and(
              eq(posts.workspace_id, value.workspaceId),
              states,
              value.channelId
                ? sql`EXISTS(SELECT 1 FROM json_each(${posts.content}, '$.channelIds') WHERE value=${value.channelId})`
                : undefined,
              value.scheduledFrom
                ? gte(posts.scheduled_at, value.scheduledFrom)
                : undefined,
              value.scheduledBefore
                ? lt(posts.scheduled_at, value.scheduledBefore)
                : undefined,
              value.cursor
                ? or(
                    lt(posts.created_at, value.cursor.createdAt),
                    and(
                      eq(posts.created_at, value.cursor.createdAt),
                      lt(posts.id, value.cursor.id),
                    ),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(posts.created_at), desc(posts.id))
          .limit(limit + 1),
      )

      const selected = rows.slice(0, limit)
      const last = selected.at(-1)

      const rankedDeliveries = client
        .select({
          id: deliveries.id,
          post_id: deliveries.post_id,
          data: deliveries.data,
          rank: sql<number>`row_number() over (partition by ${deliveries.post_id} order by ${deliveries.id})`.as(
            "delivery_rank",
          ),
        })
        .from(deliveries)
        .where(
          inArray(
            deliveries.post_id,
            selected.map((row) => row.id),
          ),
        )
        .as("ranked_deliveries")

      const storedDeliveries = selected.length
        ? yield* query(
            Schema.Struct({
              post_id: Schema.String,
              ...DeliveryRow.fields,
            }),
            () =>
              client
                .select({
                  post_id: rankedDeliveries.post_id,
                  data: rankedDeliveries.data,
                })
                .from(rankedDeliveries)
                .where(lte(rankedDeliveries.rank, sql`40`))
                .orderBy(rankedDeliveries.id),
          )
        : []

      const items = selected.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        content: row.content,
        state: row.state,
        scheduledAt: row.scheduled_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        reviewReason: row.review_reason,
        deliveries: storedDeliveries
          .filter((item) => item.post_id === row.id)
          .map((item) => item.data),
      }))

      return yield* Schema.decodeUnknownEffect(PostListPageResult)({
        items,
        nextCursor:
          rows.length > limit && last
            ? { createdAt: last.created_at, id: last.id }
            : null,
      }).pipe(
        Effect.mapError(() =>
          failure("storage-failure", "Invalid post page result"),
        ),
      )
    }),
    savePost: Effect.fn("core.savePost")(function* (
      workspaceId: string,
      content: PostContent,
      scheduledAt: string | null,
      postId?: string,
    ) {
      const valid = yield* Schema.decodeUnknownEffect(PostContent)(
        content,
      ).pipe(
        Effect.mapError(() => failure("invalid-input", "Invalid post content")),
      )

      const scheduledTime =
        scheduledAt === null ? Option.none() : DateTime.make(scheduledAt)

      if (
        scheduledAt !== null &&
        (Option.isNone(scheduledTime) ||
          DateTime.formatIso(scheduledTime.value) !== scheduledAt)
      )
        return yield* Effect.fail(
          failure("invalid-input", "Schedule must use UTC ISO time"),
        )

      for (const id of valid.channelIds) yield* channel(workspaceId, id)

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
      const id = postId ?? crypto.randomUUID()
      const stamp = yield* now()

      if (postId) {
        const updated = yield* query(Schema.Struct({ id: Schema.String }), () =>
          client
            .update(posts)
            .set({
              content: JSON.stringify(valid),
              scheduled_at: scheduledAt,
              state: scheduledAt ? "scheduled" : "draft",
              updated_at: stamp,
              review_reason: null,
            })
            .where(
              and(
                eq(posts.workspace_id, workspaceId),
                eq(posts.id, id),
                inArray(posts.state, [
                  "draft",
                  "scheduled",
                  "needs-review",
                  "cancelled",
                ]),
                isNull(posts.operation_key),
              ),
            )
            .returning({ id: posts.id }),
        )

        if (!updated.length)
          return yield* Effect.fail(
            failure("conflict", "Post cannot be edited"),
          )
      } else
        yield* write(() =>
          client.insert(posts).values({
            id,
            workspace_id: workspaceId,
            content: JSON.stringify(valid),
            state: scheduledAt ? "scheduled" : "draft",
            scheduled_at: scheduledAt,
            created_at: stamp,
            updated_at: stamp,
          }),
        )

      return yield* getPost(workspaceId, id)
    }),
    setPostState: Effect.fn("core.setPostState")(function* (
      workspaceId: string,
      id: string,
      state: typeof PostState.Type,
      reviewReason: string | null = null,
    ) {
      const stamp = yield* now()

      return yield* Schema.decodeUnknownEffect(PostState)(state).pipe(
        Effect.mapError(() => failure("invalid-input", "Invalid post state")),
        Effect.flatMap((valid) => {
          const update: Partial<typeof posts.$inferInsert> = {
            state: valid,
            review_reason: reviewReason,
            updated_at: stamp,
          }

          if (["published", "partial", "failed", "cancelled"].includes(valid)) {
            update.dispatch_status = null
            update.lease_until = null
          }

          return query(Schema.Struct({ id: Schema.String }), () =>
            client
              .update(posts)
              .set(update)
              .where(and(eq(posts.workspace_id, workspaceId), eq(posts.id, id)))
              .returning({ id: posts.id }),
          )
        }),
        Effect.flatMap(required),
        Effect.asVoid,
      )
    }),
    saveDelivery(this: void, value: Delivery) {
      return Schema.decodeUnknownEffect(Delivery)(value).pipe(
        Effect.mapError(() => failure("invalid-input", "Invalid delivery")),
        Effect.flatMap((row) =>
          query(Schema.Struct({ id: Schema.String }), () =>
            client
              .insert(deliveries)
              .select(
                client
                  .select({
                    id: sql<string>`${row.id}`.as("id"),
                    post_id: posts.id,
                    channel_id: channels.id,
                    data: sql<string>`${JSON.stringify(row)}`.as("data"),
                  })
                  .from(posts)
                  .innerJoin(
                    channels,
                    eq(channels.workspace_id, posts.workspace_id),
                  )
                  .where(
                    and(
                      eq(posts.id, row.postId),
                      eq(channels.id, row.channelId),
                      sql`json_extract(${channels.data},'$.platform')=${row.platform}`,
                    ),
                  ),
              )
              .onConflictDoUpdate({
                target: [deliveries.post_id, deliveries.channel_id],
                set: { data: JSON.stringify(row) },
              })
              .returning({ id: deliveries.id }),
          ),
        ),
        Effect.flatMap(required),
        Effect.asVoid,
      )
    },
    cancelPost: Effect.fn("core.cancelPost")(function* (
      workspaceId: string,
      id: string,
    ) {
      const stamp = yield* now()

      return yield* query(Schema.Struct({ id: Schema.String }), () =>
        client
          .update(posts)
          .set({ state: "cancelled", updated_at: stamp })
          .where(
            and(
              eq(posts.workspace_id, workspaceId),
              eq(posts.id, id),
              inArray(posts.state, ["draft", "scheduled", "needs-review"]),
              isNull(posts.operation_key),
            ),
          )
          .returning({ id: posts.id }),
      ).pipe(Effect.flatMap(required), Effect.andThen(getPost(workspaceId, id)))
    }),
    deletePost(this: void, workspaceId: string, id: string) {
      return query(Schema.Struct({ id: Schema.String }), () =>
        client
          .delete(posts)
          .where(
            and(
              eq(posts.workspace_id, workspaceId),
              eq(posts.id, id),
              inArray(posts.state, ["draft", "cancelled", "needs-review"]),
              isNull(posts.operation_key),
            ),
          )
          .returning({ id: posts.id }),
      ).pipe(Effect.flatMap(required), Effect.asVoid)
    },
    claimPost: Effect.fn("core.claimPost")(function* (
      workspaceId: string,
      id: string,
      operationKey: string,
      expected?: Pick<Post, "content" | "scheduledAt" | "updatedAt">,
    ) {
      const stamp = yield* now()

      const claimed = yield* query(Schema.Struct({ id: Schema.String }), () =>
        client
          .update(posts)
          .set({
            state: "pending",
            operation_key: operationKey,
            dispatch_status: "dispatching",
            lease_until: null,
            updated_at: stamp,
          })
          .where(
            sql`workspace_id=${workspaceId} AND id=${id} AND ((state IN ('draft','scheduled') AND operation_key IS NULL AND ${operationKey} NOT LIKE 'scheduled:%') OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key=${operationKey})) AND (${expected === undefined ? 1 : 0} OR (content=${expected ? JSON.stringify(expected.content) : null} AND scheduled_at IS ${expected?.scheduledAt ?? null} AND updated_at=${expected?.updatedAt ?? null}))`,
          )
          .returning({ id: posts.id }),
      ).pipe(Effect.map((rows) => rows.length === 1))

      if (claimed || expected === undefined) return claimed

      const current = yield* publicationOperation(workspaceId, id)

      if (
        current.operation_key === operationKey &&
        (current.dispatch_status === "dispatching" ||
          ["published", "partial", "failed", "cancelled"].includes(
            current.state,
          ))
      )
        return false

      return yield* Effect.fail(
        failure(
          "conflict",
          "Post changed before publication. Review it and try again.",
        ),
      )
    }),
    claimDuePosts: Effect.fn("core.claimDuePosts")(function* (limit: number) {
      const stamp = yield* now()
      const leaseUntil = yield* now(300000)
      const cutoff = yield* now(-900000)

      return yield* query(
        Schema.Struct({ id: Schema.String, workspace_id: Schema.String }),
        () =>
          client
            .update(posts)
            .set({
              state: "pending",
              operation_key: sql`'scheduled:'||id`,
              dispatch_status: "leased",
              lease_until: leaseUntil,
              updated_at: stamp,
            })
            .where(
              sql`id IN (SELECT id FROM posts WHERE (state='scheduled' AND scheduled_at<=${stamp} AND operation_key IS NULL) OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key='scheduled:'||id AND (lease_until<=${stamp} OR (dispatch_status='enqueued' AND lease_until IS NULL AND updated_at<=${cutoff}))) ORDER BY scheduled_at LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))}) AND ((state='scheduled' AND operation_key IS NULL) OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key='scheduled:'||id AND (lease_until<=${stamp} OR (dispatch_status='enqueued' AND lease_until IS NULL AND updated_at<=${cutoff}))))`,
            )
            .returning({ id: posts.id, workspace_id: posts.workspace_id }),
      ).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => getPost(row.workspace_id, row.id), {
            concurrency: 4,
          }),
        ),
      )
    }),
    markPostEnqueued: Effect.fn("core.markPostEnqueued")(function* (
      workspaceId: string,
      id: string,
      operationKey: string,
    ) {
      const leaseUntil = yield* now(900000)

      return yield* write(() =>
        client
          .update(posts)
          .set({ dispatch_status: "enqueued", lease_until: leaseUntil })
          .where(
            and(
              eq(posts.workspace_id, workspaceId),
              eq(posts.id, id),
              eq(posts.state, "pending"),
              eq(posts.operation_key, operationKey),
              eq(posts.dispatch_status, "leased"),
            ),
          ),
      )
    }),
    holdPost: Effect.fn("core.holdPost")(function* (
      workspaceId: string,
      id: string,
      reason: string,
    ) {
      const stamp = yield* now()

      const rows = yield* query(Schema.Struct({ id: Schema.String }), () =>
        client
          .update(posts)
          .set({
            state: "needs-review",
            review_reason: reason,
            operation_key: null,
            dispatch_status: null,
            lease_until: null,
            updated_at: stamp,
          })
          .where(
            sql`workspace_id=${workspaceId} AND id=${id} AND (operation_key IS NULL OR dispatch_status IN ('leased','enqueued'))`,
          )
          .returning({ id: posts.id }),
      )

      if (!rows.length)
        return yield* Effect.fail(
          failure("conflict", "Post cannot be held after dispatch"),
        )
    }),
    listPendingPosts: Effect.fn("core.listPendingPosts")(function* (
      limit: number,
    ) {
      const cutoff = yield* now(-300000)

      return yield* query(
        Schema.Struct({ id: Schema.String, workspace_id: Schema.String }),
        () =>
          client
            .select({ id: posts.id, workspace_id: posts.workspace_id })
            .from(posts)
            .where(
              and(
                eq(posts.state, "pending"),
                eq(posts.dispatch_status, "dispatching"),
                lt(posts.updated_at, cutoff),
              ),
            )
            .orderBy(posts.updated_at)
            .limit(Math.max(1, Math.min(100, Math.floor(limit)))),
      ).pipe(
        Effect.flatMap((rows) =>
          Effect.forEach(rows, (row) => getPost(row.workspace_id, row.id), {
            concurrency: 4,
          }),
        ),
      )
    }),
  }

  return {
    getPost: validateOperation(
      operations.getPost,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    publicationOperation: validateOperation(
      operations.publicationOperation,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    listPostsPage: validateOperation(
      operations.listPostsPage,
      Schema.Tuple([PostListPageInput]),
    ),
    listPosts: validateOperation(
      operations.listPosts,
      Schema.Tuple([
        Schema.String,
        Schema.Literals(["all", "draft", "queue", "sent"]),
      ]),
    ),
    savePost: validateOperation(
      operations.savePost,
      Schema.Tuple([
        Schema.String,
        PostContent,
        Schema.NullOr(Schema.String),
        Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
      ]),
    ),
    setPostState: validateOperation(
      operations.setPostState,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        PostState,
        Schema.optionalKey(Schema.UndefinedOr(Schema.NullOr(Schema.String))),
      ]),
    ),
    saveDelivery: validateOperation(
      operations.saveDelivery,
      Schema.Tuple([Delivery]),
    ),
    cancelPost: validateOperation(
      operations.cancelPost,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    deletePost: validateOperation(
      operations.deletePost,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    claimPost: validateOperation(
      operations.claimPost,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.String,
        Schema.optionalKey(
          Schema.UndefinedOr(
            Schema.Struct({
              content: PostContent,
              scheduledAt: Schema.NullOr(Schema.String),
              updatedAt: Schema.String,
            }),
          ),
        ),
      ]),
    ),
    claimDuePosts: validateOperation(
      operations.claimDuePosts,
      Schema.Tuple([Schema.Number]),
    ),
    markPostEnqueued: validateOperation(
      operations.markPostEnqueued,
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    ),
    holdPost: validateOperation(
      operations.holdPost,
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    ),
    listPendingPosts: validateOperation(
      operations.listPendingPosts,
      Schema.Tuple([Schema.Number]),
    ),
  }
}
