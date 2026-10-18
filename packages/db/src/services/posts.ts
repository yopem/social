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
import {
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Predicate,
  Schema,
} from "effect"

import { channels } from "db/schema/channels"
import { media, MediaRow } from "db/schema/media"
import {
  posts,
  deliveries,
  postSaveRequests,
  DeliveryRow,
  PostRow,
  PostsInsert,
  PostSaveRequestRow,
} from "db/schema/posts"
import { ChannelsDb, type createChannelsRepository } from "db/services/channels"
import { Database } from "db/services/client"
import type { DatabaseContext } from "db/services/context"
import { failure, hash, now } from "db/services/context"
import { validateOperation } from "db/services/validation"
import { PostListPageInput, PostListPageResult } from "rpc/contracts/posts"
import {
  Delivery,
  PostContent,
  PostInput,
  PostListInput,
  PostSaveInput,
  PostState,
} from "rpc/contracts/posts"
import type { JsonValue } from "rpc/lib/json"
import { Id } from "rpc/lib/schema"

const PostSaveDbInput = Schema.Struct({
  ...PostSaveInput.fields,
  userId: Schema.optional(Id),
}).check(
  Schema.makeFilter((value) => !value.idempotencyKey || Boolean(value.userId), {
    message: "A keyed save requires a user.",
  }),
)

const PostSaveRequestInput = Schema.Struct({
  workspaceId: PostSaveInput.fields.workspaceId,
  userId: Id,
  idempotencyKey: Id,
  content: PostContent,
  scheduledAt: PostSaveInput.fields.scheduledAt,
})

function saveRequestFingerprint(input: typeof PostSaveRequestInput.Type) {
  return hash(
    JSON.stringify(
      { content: input.content, scheduledAt: input.scheduledAt },
      (_key: string, value: JsonValue | undefined) => {
        if (!Predicate.isReadonlyObject(value)) return value

        return Object.fromEntries(
          Object.entries(value).sort(([left], [right]) => {
            if (left === right) return 0

            return left < right ? -1 : 1
          }),
        )
      },
    ),
  )
}

const PostStateChangeInput = Schema.Struct({
  workspaceId: Schema.String,
  postId: Schema.String,
  state: PostState,
  reviewReason: Schema.optional(Schema.NullOr(Schema.String)),
})

const PostClaimInput = Schema.Struct({
  workspaceId: Schema.String,
  postId: Schema.String,
  operationKey: Schema.String,
  expectedPost: Schema.optional(
    Schema.Struct({
      content: PostContent,
      scheduledAt: Schema.NullOr(Schema.String),
      updatedAt: Schema.String,
    }),
  ),
})

const PostEnqueueInput = Schema.Struct({
  workspaceId: Schema.String,
  postId: Schema.String,
  operationKey: Schema.String,
})

const PostHoldInput = Schema.Struct({
  workspaceId: Schema.String,
  postId: Schema.String,
  reason: Schema.String,
})

export class PostsDb extends Context.Service<
  PostsDb,
  ReturnType<typeof createPostsRepository>
>()("social/PostsDb") {
  static readonly layer = Layer.effect(
    PostsDb,
    Effect.gen(function* () {
      const context = yield* Database
      const channelsRepository = yield* ChannelsDb

      return createPostsRepository(context, channelsRepository)
    }),
  )
}

export function createPostsRepository(
  context: DatabaseContext,
  channelsRepository: ReturnType<typeof createChannelsRepository>,
) {
  const { client, query, write, batch, required } = context
  const { channel } = channelsRepository

  const publicationOperation = Effect.fnUntraced(function* ({
    workspaceId,
    postId: id,
  }: typeof PostInput.Type) {
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

  const getPost = Effect.fnUntraced(function* ({
    workspaceId,
    postId: id,
  }: typeof PostInput.Type) {
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

  const findSavedPost = Effect.fn("posts.findSavedPost")(function* (
    input: typeof PostSaveRequestInput.Type,
  ) {
    const fingerprint = yield* saveRequestFingerprint(input)

    const requests = yield* query(PostSaveRequestRow, () =>
      client
        .select()
        .from(postSaveRequests)
        .where(
          and(
            eq(postSaveRequests.workspace_id, input.workspaceId),
            eq(postSaveRequests.user_id, input.userId),
            eq(postSaveRequests.request_key, input.idempotencyKey),
          ),
        ),
    )

    const saved = requests[0]

    if (!saved) return null

    if (saved.fingerprint !== fingerprint)
      return yield* Effect.fail(
        failure("conflict", "Save key belongs to another request."),
      )

    return yield* getPost({
      workspaceId: input.workspaceId,
      postId: saved.post_id,
    }).pipe(
      Effect.mapError((error) =>
        error.code === "not-found"
          ? failure(
              "conflict",
              "The original post was removed. Start a new post.",
            )
          : error,
      ),
    )
  })

  const postOperations = {
    getPost,
    findSavedPost,
    publicationOperation,
    listPosts(this: void, { workspaceId, filter }: typeof PostListInput.Type) {
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
          Effect.forEach(
            rows,
            (row) => getPost({ workspaceId, postId: row.id }),
            {
              concurrency: 4,
            },
          ),
        ),
      )
    },
    listPostsPage: Effect.fn("posts.listPostsPage")(function* (
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
    savePost: Effect.fn("posts.savePost")(function* ({
      workspaceId,
      content,
      scheduledAt,
      postId,
      userId,
      idempotencyKey,
    }: typeof PostSaveDbInput.Type) {
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

      const request =
        !postId && userId && idempotencyKey
          ? { workspaceId, userId, idempotencyKey, content: valid, scheduledAt }
          : null

      if (request) {
        const saved = yield* findSavedPost(request)

        if (saved) return saved
      }

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
      } else {
        const row = yield* Schema.decodeUnknownEffect(PostsInsert)({
          id,
          workspace_id: workspaceId,
          content: JSON.stringify(valid),
          state: scheduledAt ? "scheduled" : "draft",
          scheduled_at: scheduledAt,
          created_at: stamp,
          updated_at: stamp,
        }).pipe(
          Effect.mapError(() =>
            failure("invalid-input", "Invalid post values"),
          ),
        )

        if (request) {
          const fingerprint = yield* saveRequestFingerprint(request)

          const receipt = yield* Schema.decodeUnknownEffect(PostSaveRequestRow)(
            {
              workspace_id: workspaceId,
              user_id: request.userId,
              request_key: request.idempotencyKey,
              fingerprint,
              post_id: id,
              created_at: stamp,
            },
          ).pipe(
            Effect.mapError(() =>
              failure("invalid-input", "Invalid save request"),
            ),
          )

          // Only the request that creates the receipt can insert its post.
          yield* batch([
            client
              .insert(postSaveRequests)
              .values(receipt)
              .onConflictDoNothing(),
            // Drizzle requires every post column in table order for INSERT SELECT.
            client.insert(posts).select(
              client
                .select({
                  id: postSaveRequests.post_id,
                  workspace_id: postSaveRequests.workspace_id,
                  content: sql<string>`${row.content}`.as("content"),
                  state: sql<string>`${row.state}`.as("state"),
                  scheduled_at: sql<string | null>`${scheduledAt}`.as(
                    "scheduled_at",
                  ),
                  created_at: postSaveRequests.created_at,
                  updated_at: postSaveRequests.created_at,
                  review_reason: sql<null>`NULL`.as("review_reason"),
                  operation_key: sql<null>`NULL`.as("operation_key"),
                  lease_until: sql<null>`NULL`.as("lease_until"),
                  dispatch_status: sql<null>`NULL`.as("dispatch_status"),
                })
                .from(postSaveRequests)
                .where(
                  and(
                    eq(postSaveRequests.workspace_id, workspaceId),
                    eq(postSaveRequests.user_id, request.userId),
                    eq(postSaveRequests.request_key, request.idempotencyKey),
                    eq(postSaveRequests.post_id, id),
                    eq(postSaveRequests.fingerprint, fingerprint),
                  ),
                ),
            ),
          ])

          const saved = yield* findSavedPost(request)

          if (!saved)
            return yield* Effect.fail(
              failure("storage-failure", "Saved request is missing."),
            )

          return saved
        }

        yield* write(() => client.insert(posts).values(row))
      }

      return yield* getPost({ workspaceId, postId: id })
    }),
    setPostState: Effect.fn("posts.setPostState")(function* ({
      workspaceId,
      postId: id,
      state,
      reviewReason = null,
    }: typeof PostStateChangeInput.Type) {
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
    cancelPost: Effect.fn("posts.cancelPost")(function* ({
      workspaceId,
      postId: id,
    }: typeof PostInput.Type) {
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
      ).pipe(
        Effect.flatMap(required),
        Effect.andThen(getPost({ workspaceId, postId: id })),
      )
    }),
    deletePost(this: void, { workspaceId, postId: id }: typeof PostInput.Type) {
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
    claimPost: Effect.fn("posts.claimPost")(function* ({
      workspaceId,
      postId: id,
      operationKey,
      expectedPost: expected,
    }: typeof PostClaimInput.Type) {
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

      const current = yield* publicationOperation({ workspaceId, postId: id })

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
    claimDuePosts: Effect.fn("posts.claimDuePosts")(function* (limit: number) {
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
          Effect.forEach(
            rows,
            (row) => getPost({ workspaceId: row.workspace_id, postId: row.id }),
            {
              concurrency: 4,
            },
          ),
        ),
      )
    }),
    markPostEnqueued: Effect.fn("posts.markPostEnqueued")(function* ({
      workspaceId,
      postId: id,
      operationKey,
    }: typeof PostEnqueueInput.Type) {
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
    holdPost: Effect.fn("posts.holdPost")(function* ({
      workspaceId,
      postId: id,
      reason,
    }: typeof PostHoldInput.Type) {
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
    listPendingPosts: Effect.fn("posts.listPendingPosts")(function* (
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
          Effect.forEach(
            rows,
            (row) => getPost({ workspaceId: row.workspace_id, postId: row.id }),
            {
              concurrency: 4,
            },
          ),
        ),
      )
    }),
  }

  return {
    getPost: validateOperation(
      postOperations.getPost,
      Schema.Tuple([PostInput]),
    ),
    publicationOperation: validateOperation(
      postOperations.publicationOperation,
      Schema.Tuple([PostInput]),
    ),
    listPostsPage: validateOperation(
      postOperations.listPostsPage,
      Schema.Tuple([PostListPageInput]),
    ),
    listPosts: validateOperation(
      postOperations.listPosts,
      Schema.Tuple([PostListInput]),
    ),
    savePost: validateOperation(
      postOperations.savePost,
      Schema.Tuple([PostSaveDbInput]),
    ),
    findSavedPost: validateOperation(
      postOperations.findSavedPost,
      Schema.Tuple([PostSaveRequestInput]),
    ),
    setPostState: validateOperation(
      postOperations.setPostState,
      Schema.Tuple([PostStateChangeInput]),
    ),
    saveDelivery: validateOperation(
      postOperations.saveDelivery,
      Schema.Tuple([Delivery]),
    ),
    cancelPost: validateOperation(
      postOperations.cancelPost,
      Schema.Tuple([PostInput]),
    ),
    deletePost: validateOperation(
      postOperations.deletePost,
      Schema.Tuple([PostInput]),
    ),
    claimPost: validateOperation(
      postOperations.claimPost,
      Schema.Tuple([PostClaimInput]),
    ),
    claimDuePosts: validateOperation(
      postOperations.claimDuePosts,
      Schema.Tuple([Schema.Number]),
    ),
    markPostEnqueued: validateOperation(
      postOperations.markPostEnqueued,
      Schema.Tuple([PostEnqueueInput]),
    ),
    holdPost: validateOperation(
      postOperations.holdPost,
      Schema.Tuple([PostHoldInput]),
    ),
    listPendingPosts: validateOperation(
      postOperations.listPendingPosts,
      Schema.Tuple([Schema.Number]),
    ),
  }
}
