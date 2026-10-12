import type { D1Database } from "@cloudflare/workers-types"

import { and, eq, inArray, lte, notExists, or, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { Context, DateTime, Effect, Layer, Schema } from "effect"

import { authAttempts } from "db/schema/core"
import { accountOperations } from "db/schema/deletion"
import { appSessions } from "db/schema/session"
import {
  socialAttempts,
  socialInbox,
  socialRefreshLocks,
} from "db/schema/social"
import { DatabaseRunResult } from "db/services/validation"
import { ApiError } from "rpc/contracts/models"

const CleanupInput = Schema.Struct({})

const CleanupResult = Schema.Struct({
  expiredSessions: Schema.Int,
  expiredSignIns: Schema.Int,
  expiredAttempts: Schema.Int,
  expiredLocks: Schema.Int,
  staleCompleted: Schema.Int,
})

function failure() {
  return new ApiError({
    code: "storage-failure",
    message: "Technical data cleanup failed.",
  })
}

function makeRetention(binding: D1Database) {
  const db = drizzle(binding)

  const cleanup = Effect.fn("RetentionDb.cleanup")(function* (
    input: typeof CleanupInput.Type = {},
  ) {
    yield* Schema.decodeUnknownEffect(CleanupInput)(input).pipe(
      Effect.mapError(
        () =>
          new ApiError({
            code: "invalid-input",
            message: "Invalid cleanup input.",
          }),
      ),
    )
    const time = yield* DateTime.now
    const stamp = DateTime.formatIso(time)
    const epoch = DateTime.toEpochMillis(time)

    const cutoff = DateTime.formatIso(
      DateTime.subtractDuration(time, 7 * 86400000),
    )

    const expiredSession = and(
      lte(appSessions.accessExpiresAt, epoch),
      lte(appSessions.refreshExpiresAt, epoch),
    )

    const expiredAttempt = and(
      lte(socialAttempts.expires_at, stamp),
      notExists(
        db
          .select()
          .from(accountOperations)
          .where(
            or(
              eq(accountOperations.user_id, socialAttempts.principal_id),
              eq(accountOperations.workspace_id, socialAttempts.tenant_id),
            ),
          ),
      ),
    )

    const oldInbox = and(
      eq(socialInbox.state, "complete"),
      sql`coalesce(${socialInbox.completed_at}, ${socialInbox.received_at}) < ${cutoff}`,
    )

    const results = yield* Effect.tryPromise({
      try: () =>
        db.batch([
          db
            .delete(appSessions)
            .where(
              inArray(
                appSessions.id,
                db
                  .select({ id: appSessions.id })
                  .from(appSessions)
                  .where(expiredSession)
                  .orderBy(appSessions.id)
                  .limit(500),
              ),
            ),
          db
            .delete(authAttempts)
            .where(
              inArray(
                authAttempts.state,
                db
                  .select({ state: authAttempts.state })
                  .from(authAttempts)
                  .where(lte(authAttempts.expires_at, stamp))
                  .orderBy(authAttempts.state)
                  .limit(500),
              ),
            ),
          db
            .delete(socialAttempts)
            .where(
              inArray(
                socialAttempts.id,
                db
                  .select({ id: socialAttempts.id })
                  .from(socialAttempts)
                  .where(expiredAttempt)
                  .orderBy(socialAttempts.id)
                  .limit(500),
              ),
            ),
          db
            .delete(socialRefreshLocks)
            .where(
              inArray(
                socialRefreshLocks.key,
                db
                  .select({ key: socialRefreshLocks.key })
                  .from(socialRefreshLocks)
                  .where(lte(socialRefreshLocks.expires_at, stamp))
                  .orderBy(socialRefreshLocks.key)
                  .limit(500),
              ),
            ),
          db
            .delete(socialInbox)
            .where(
              inArray(
                socialInbox.key,
                db
                  .select({ key: socialInbox.key })
                  .from(socialInbox)
                  .where(oldInbox)
                  .orderBy(socialInbox.key)
                  .limit(500),
              ),
            ),
        ]),
      catch: failure,
    })

    const rows = yield* Schema.decodeUnknownEffect(
      Schema.Tuple([
        DatabaseRunResult,
        DatabaseRunResult,
        DatabaseRunResult,
        DatabaseRunResult,
        DatabaseRunResult,
      ]),
    )(results).pipe(Effect.mapError(failure))

    return yield* Schema.decodeUnknownEffect(CleanupResult)({
      expiredSessions: rows[0].meta.changes,
      expiredSignIns: rows[1].meta.changes,
      expiredAttempts: rows[2].meta.changes,
      expiredLocks: rows[3].meta.changes,
      staleCompleted: rows[4].meta.changes,
    }).pipe(Effect.mapError(failure))
  })

  return { cleanup }
}

export class RetentionDb extends Context.Service<
  RetentionDb,
  ReturnType<typeof makeRetention>
>()("social/RetentionDb") {}

export function retentionDbLayer(binding: D1Database) {
  return Layer.succeed(RetentionDb, makeRetention(binding))
}
