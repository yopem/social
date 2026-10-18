import type { D1Database } from "@cloudflare/workers-types"

import { and, count, eq, inArray, lte, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { Array, DateTime, Effect, Schema, SchemaIssue, Struct } from "effect"

import { AuthAttemptsInsert, authAttempts } from "db/schema/accounts"
import {
  AccountOperationsInsert,
  accountOperations,
} from "db/schema/accounts/deletion"
import {
  AttemptRow,
  socialAttempts,
  socialInbox,
  socialRefreshLocks,
  SocialRefreshLocksInsert,
} from "db/schema/channels/social"
import { AppSessionRow, appSessions } from "db/schema/session"
import { ApiError } from "rpc/lib/errors"

const Fixture = Schema.Struct({
  fixtureId: Schema.String.check(Schema.isUUID()),
  userId: Schema.NonEmptyString,
  workspaceId: Schema.NonEmptyString,
})

const Seed = Schema.Struct({
  ...Fixture.fields,
  mode: Schema.Literals(["normal", "bounded", "held"]),
  ciphertext: Schema.NonEmptyString,
  accessHash: AppSessionRow.fields.accessHash,
  refreshHash: AppSessionRow.fields.refreshHash,
  activeAccessHash: AppSessionRow.fields.accessHash,
  activeRefreshHash: AppSessionRow.fields.refreshHash,
})

const CountRow = Schema.Array(
  Schema.Struct({ value: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) }),
)

function failure() {
  return new ApiError({
    code: "storage-failure",
    message: "Retention fixture failed.",
  })
}

function validationFailure(error: Schema.SchemaError) {
  // Log paths only. Fixture rows contain encrypted credentials.
  const paths = SchemaIssue.makeFormatterStandardSchemaV1()(
    error.issue,
  ).issues.map((issue) => issue.path)

  return Effect.logError("Retention fixture validation failed.", {
    paths,
  }).pipe(Effect.andThen(Effect.fail(failure())))
}

function activeSessionId(fixtureId: string) {
  return `${fixtureId.slice(0, -1)}${fixtureId.endsWith("0") ? "1" : "0"}`
}

function execute<A>(run: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: () => Promise.resolve(run()),
    catch: failure,
  })
}

export const seedRetentionFixture = Effect.fn("seedRetentionFixture")(
  function* (binding: D1Database, input: typeof Seed.Type) {
    const value = yield* Schema.decodeUnknownEffect(Seed)(input).pipe(
      Effect.mapError(failure),
    )

    const db = drizzle(binding)
    const time = yield* DateTime.now

    const old = DateTime.formatIso(
      DateTime.subtractDuration(time, 8 * 86400000),
    )

    const expired = DateTime.formatIso(
      DateTime.subtractDuration(time, 86400000),
    )

    const stamp = DateTime.formatIso(time)
    const future = DateTime.formatIso(DateTime.addDuration(time, 86400000))
    const epoch = DateTime.toEpochMillis(time)
    const prefix = `retention:${value.fixtureId}:`

    // Drain old rows before a bounded run so retries do not change its row count.
    for (let page = 0; page < 20; page++) {
      const result = yield* execute(() =>
        db
          .delete(socialInbox)
          .where(
            inArray(
              socialInbox.key,
              db
                .select({ key: socialInbox.key })
                .from(socialInbox)
                .where(
                  and(
                    eq(socialInbox.state, "complete"),
                    lte(
                      sql`coalesce(${socialInbox.completed_at}, ${socialInbox.received_at})`,
                      DateTime.formatIso(
                        DateTime.subtractDuration(time, 7 * 86400000),
                      ),
                    ),
                  ),
                )
                .limit(500),
            ),
          )
          .run(),
      )

      const meta = yield* Schema.decodeUnknownEffect(
        Schema.Struct({ meta: Schema.Struct({ changes: Schema.Int }) }),
      )(result).pipe(Effect.mapError(failure))

      if (meta.meta.changes === 0) break

      if (page === 19) return yield* failure()
    }

    const sessions = yield* Schema.decodeUnknownEffect(
      Schema.Array(AppSessionRow),
    )([
      {
        id: value.fixtureId,
        userId: value.userId,
        accessHash: value.accessHash,
        refreshHash: value.refreshHash,
        accessExpiresAt: epoch - 86400000,
        refreshExpiresAt: epoch - 86400000,
        rotationStartedAt: null,
        priorAccessHash: null,
        priorRefreshHash: null,
        priorExpiresAt: null,
      },
      {
        id: activeSessionId(value.fixtureId),
        userId: value.userId,
        accessHash: value.activeAccessHash,
        refreshHash: value.activeRefreshHash,
        accessExpiresAt: epoch + 86400000,
        refreshExpiresAt: epoch + 86400000,
        rotationStartedAt: null,
        priorAccessHash: null,
        priorRefreshHash: null,
        priorExpiresAt: null,
      },
    ]).pipe(Effect.mapError(failure))

    const attempts = yield* Schema.decodeUnknownEffect(
      Schema.Array(AttemptRow),
    )([
      {
        id: `${prefix}expired`,
        tenant_id: value.workspaceId,
        principal_id: value.userId,
        platform: "x",
        state: `${prefix}expired`,
        expires_at: expired,
        ciphertext: value.ciphertext,
        discovery_claimed: 0,
        discovery: null,
        consumed_token: null,
      },
      {
        id: `${prefix}active`,
        tenant_id: value.workspaceId,
        principal_id: value.userId,
        platform: "x",
        state: `${prefix}active`,
        expires_at: future,
        ciphertext: value.ciphertext,
        discovery_claimed: 0,
        discovery: null,
        consumed_token: null,
      },
    ]).pipe(Effect.mapError(failure))

    const lock = yield* Schema.decodeUnknownEffect(SocialRefreshLocksInsert)({
      key: `${prefix}lock`,
      token: value.fixtureId,
      expires_at: expired,
    }).pipe(Effect.mapError(failure))

    const signIns = yield* Schema.decodeUnknownEffect(
      Schema.Array(AuthAttemptsInsert),
    )([
      {
        state: `${prefix}expired-sign-in`,
        nonce_hash: value.accessHash,
        verifier: value.ciphertext,
        expires_at: expired,
        consumed_at: null,
      },
      {
        state: `${prefix}active-sign-in`,
        nonce_hash: value.activeAccessHash,
        verifier: value.ciphertext,
        expires_at: future,
        consumed_at: null,
      },
    ]).pipe(Effect.mapError(failure))

    yield* execute(() =>
      db.batch([
        db.insert(authAttempts).values([...signIns]),
        db.insert(appSessions).values([...sessions]),
        db.insert(socialAttempts).values([...attempts]),
        db.insert(socialRefreshLocks).values(lock),
      ]),
    )

    if (value.mode === "held") {
      const lease = yield* Schema.decodeUnknownEffect(AccountOperationsInsert)({
        token: value.fixtureId,
        user_id: value.userId,
        workspace_id: value.workspaceId,
        started_at: stamp,
      }).pipe(Effect.mapError(failure))

      yield* execute(() => db.insert(accountOperations).values(lease))
    }

    const inboxSchema = Schema.Struct({
      key: Schema.NonEmptyString,
      platform: Schema.Literal("x"),
      data: Schema.NonEmptyString,
      tenants: Schema.fromJsonString(Schema.Array(Schema.String)),
      state: Schema.Literals(["complete", "pending"]),
      received_at: Schema.String,
      completed_at: Schema.NullOr(Schema.String),
    })

    const amount = value.mode === "bounded" ? 501 : 1

    const rows = yield* Schema.decodeUnknownEffect(Schema.Array(inboxSchema))(
      Array.makeBy(amount, (index) => ({
        key: `${prefix}old:${index}`,
        platform: "x",
        data: value.ciphertext,
        tenants: JSON.stringify([value.workspaceId]),
        state: "complete",
        received_at: old,
        completed_at: index === 0 ? null : old,
      })),
    ).pipe(Effect.catchTag("SchemaError", validationFailure))

    // Keep each insert below D1's 100-value limit.
    const batchSize = Math.floor(100 / Struct.keys(inboxSchema.fields).length)

    yield* Effect.forEach(
      Array.chunksOf(rows, batchSize),
      (batch) =>
        execute(() =>
          db.insert(socialInbox).values(
            batch.map((row) => ({
              ...row,
              tenants: JSON.stringify(row.tenants),
            })),
          ),
        ),
      { concurrency: 1, discard: true },
    )

    const latest = yield* Schema.decodeUnknownEffect(Schema.Array(inboxSchema))(
      [
        {
          key: `${prefix}recent`,
          platform: "x",
          data: value.ciphertext,
          tenants: JSON.stringify([value.workspaceId]),
          state: "complete",
          received_at: old,
          completed_at: stamp,
        },
        {
          key: `${prefix}pending`,
          platform: "x",
          data: value.ciphertext,
          tenants: JSON.stringify([value.workspaceId]),
          state: "pending",
          received_at: old,
          completed_at: null,
        },
      ],
    ).pipe(Effect.mapError(failure))

    yield* execute(() =>
      db.insert(socialInbox).values(
        latest.map((row) => ({
          ...row,
          tenants: JSON.stringify(row.tenants),
        })),
      ),
    )

    return { fixtureId: value.fixtureId }
  },
)

export const retentionFixtureCounts = Effect.fn("retentionFixtureCounts")(
  function* (binding: D1Database, input: typeof Fixture.Type) {
    const value = yield* Schema.decodeUnknownEffect(Fixture)(input).pipe(
      Effect.mapError(failure),
    )

    const db = drizzle(binding)
    const prefix = `retention:${value.fixtureId}:`
    const completedPrefix = `${prefix}old:`

    const queries = {
      expiredSignIns: db
        .select({ value: count() })
        .from(authAttempts)
        .where(eq(authAttempts.state, `${prefix}expired-sign-in`)),
      activeSignIns: db
        .select({ value: count() })
        .from(authAttempts)
        .where(eq(authAttempts.state, `${prefix}active-sign-in`)),
      expiredSessions: db
        .select({ value: count() })
        .from(appSessions)
        .where(
          and(
            eq(appSessions.id, value.fixtureId),
            eq(appSessions.userId, value.userId),
          ),
        ),
      activeSessions: db
        .select({ value: count() })
        .from(appSessions)
        .where(
          and(
            eq(appSessions.id, activeSessionId(value.fixtureId)),
            eq(appSessions.userId, value.userId),
          ),
        ),
      expiredAttempts: db
        .select({ value: count() })
        .from(socialAttempts)
        .where(
          and(
            eq(socialAttempts.id, `${prefix}expired`),
            eq(socialAttempts.principal_id, value.userId),
            eq(socialAttempts.tenant_id, value.workspaceId),
          ),
        ),
      activeAttempts: db
        .select({ value: count() })
        .from(socialAttempts)
        .where(
          and(
            eq(socialAttempts.id, `${prefix}active`),
            eq(socialAttempts.principal_id, value.userId),
            eq(socialAttempts.tenant_id, value.workspaceId),
          ),
        ),
      expiredLocks: db
        .select({ value: count() })
        .from(socialRefreshLocks)
        .where(eq(socialRefreshLocks.key, `${prefix}lock`)),
      // Use substr because a LIKE pattern exceeds the D1 limit.
      staleCompleted: db
        .select({ value: count() })
        .from(socialInbox)
        .where(
          eq(
            sql<string>`substr(${socialInbox.key}, 1, length(${completedPrefix}))`,
            completedPrefix,
          ),
        ),
      recentCompleted: db
        .select({ value: count() })
        .from(socialInbox)
        .where(eq(socialInbox.key, `${prefix}recent`)),
      pendingInbox: db
        .select({ value: count() })
        .from(socialInbox)
        .where(eq(socialInbox.key, `${prefix}pending`)),
    }

    const result = yield* Effect.forEach(
      Object.entries(queries),
      ([key, query]) =>
        execute(() => query).pipe(
          Effect.flatMap((rows) =>
            Schema.decodeUnknownEffect(CountRow)(rows).pipe(
              Effect.catchTag("SchemaError", validationFailure),
            ),
          ),
          Effect.flatMap((rows) =>
            rows[0]
              ? Effect.succeed([key, rows[0].value] as const)
              : Effect.fail(failure()),
          ),
        ),
    )

    return yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        expiredSignIns: Schema.Int,
        activeSignIns: Schema.Int,
        expiredSessions: Schema.Int,
        activeSessions: Schema.Int,
        expiredAttempts: Schema.Int,
        activeAttempts: Schema.Int,
        expiredLocks: Schema.Int,
        staleCompleted: Schema.Int,
        recentCompleted: Schema.Int,
        pendingInbox: Schema.Int,
      }),
    )(Object.fromEntries(result)).pipe(
      Effect.catchTag("SchemaError", validationFailure),
    )
  },
)

export const releaseRetentionFixture = Effect.fn("releaseRetentionFixture")(
  function* (binding: D1Database, input: typeof Fixture.Type) {
    const value = yield* Schema.decodeUnknownEffect(Fixture)(input).pipe(
      Effect.mapError(failure),
    )

    const db = drizzle(binding)
    yield* execute(() =>
      db
        .delete(accountOperations)
        .where(
          and(
            eq(accountOperations.token, value.fixtureId),
            eq(accountOperations.user_id, value.userId),
            eq(accountOperations.workspace_id, value.workspaceId),
          ),
        ),
    )
  },
)
