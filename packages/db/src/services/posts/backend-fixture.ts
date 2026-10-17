import type { D1Database } from "@cloudflare/workers-types"

import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { DateTime, Effect, Match, Schema } from "effect"

import { posts, PostsInsert } from "db/schema/posts"
import { DatabaseRunResult } from "db/services/validation"
import { ApiError } from "rpc/lib/errors"

function failure() {
  return new ApiError({
    code: "storage-failure",
    message: "Backend fixture database failed.",
  })
}

export const seedBackendPosts = Effect.fn("seedBackendPosts")(function* (
  binding: D1Database,
  workspaceId: string,
  channelId: string,
  timing: {
    readonly scheduledAt: string
    readonly scheduledBefore: string
    readonly boundaryAt: string
  },
) {
  const db = drizzle(binding)
  const time = yield* DateTime.now
  const stamp = DateTime.formatIso(time)
  const { scheduledAt, scheduledBefore, boundaryAt } = timing
  const old = DateTime.formatIso(DateTime.subtractDuration(time, 86400000))
  const scheduledId = crypto.randomUUID()
  const boundaryId = crypto.randomUUID()

  const rows = yield* Schema.decodeUnknownEffect(Schema.Array(PostsInsert))([
    ...Array.from({ length: 105 }, () => ({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      content: JSON.stringify({
        text: "Pagination fixture",
        mediaIds: [],
        channelIds: [],
        overrides: [],
      }),
      state: "draft",
      scheduled_at: null,
      created_at: stamp,
      updated_at: stamp,
    })),
    ...[scheduledId, boundaryId].map((id, index) => ({
      id,
      workspace_id: workspaceId,
      content: JSON.stringify({
        text: "Older scheduled fixture",
        mediaIds: [],
        channelIds: [channelId],
        overrides: [],
      }),
      state: "scheduled",
      scheduled_at: index === 0 ? scheduledAt : boundaryAt,
      created_at: old,
      updated_at: old,
    })),
  ]).pipe(Effect.mapError(failure))

  yield* Effect.forEach(
    rows,
    (row) =>
      Effect.tryPromise({
        try: () => db.insert(posts).values(row),
        catch: failure,
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
        Effect.mapError(failure),
      ),
    { concurrency: 1, discard: true },
  )

  return { scheduledId, boundaryId, scheduledAt, scheduledBefore, boundaryAt }
})

export const seedBackendRecovery = Effect.fn("seedBackendRecovery")(function* (
  binding: D1Database,
  workspaceId: string,
  ids: readonly string[],
) {
  const db = drizzle(binding)
  const time = yield* DateTime.now
  const expired = DateTime.formatIso(DateTime.subtractDuration(time, 1800000))
  const fresh = DateTime.formatIso(DateTime.add(time, { hours: 1 }))
  yield* Effect.forEach(
    ids,
    (id, index) =>
      Effect.tryPromise({
        try: () =>
          db
            .update(posts)
            .set({
              state: "pending",
              operation_key: `scheduled:${id}`,
              dispatch_status: index === 2 ? "dispatching" : "enqueued",
              lease_until: Match.value(index).pipe(
                Match.when(3, () => null),
                Match.when(1, () => fresh),
                Match.orElse(() => expired),
              ),
              updated_at: expired,
            })
            .where(and(eq(posts.workspace_id, workspaceId), eq(posts.id, id))),
        catch: failure,
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
        Effect.mapError(failure),
      ),
    { concurrency: 1, discard: true },
  )
})
