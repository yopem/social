import type { D1Database } from "@cloudflare/workers-types"

import { and, eq, gt, isNull, or } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { Context, Effect, Layer, Schema } from "effect"

import {
  AppSessionRow,
  appSessions,
  SessionHashes,
  SessionLookup,
} from "db/schema/session"
import { ApiError } from "rpc/contracts/models"

function failure() {
  return new ApiError({
    code: "storage-failure",
    message: "App session storage failed",
  })
}

function makeSessionDb(database: D1Database) {
  const db = drizzle(database)

  function execute<A, I>(
    schema: Schema.Codec<A, I>,
    run: () => PromiseLike<(typeof AppSessionRow.Type)[]>,
  ) {
    return Effect.tryPromise({
      try: () => Promise.resolve(run()),
      catch: failure,
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(schema)),
      Effect.mapError(failure),
    )
  }

  function decode<A, I>(schema: Schema.Codec<A, I>, input: A) {
    return Schema.decodeUnknownEffect(schema)(input).pipe(
      Effect.mapError(failure),
    )
  }

  return {
    create(input: typeof AppSessionRow.Type) {
      return decode(AppSessionRow, input).pipe(
        Effect.flatMap((row) =>
          execute(Schema.Array(AppSessionRow), () =>
            db.insert(appSessions).values(row).returning(),
          ),
        ),
        Effect.asVoid,
      )
    },
    find: Effect.fn("session.find")(function* (
      input: typeof SessionLookup.Type,
    ) {
      const value = yield* decode(SessionLookup, input)

      if (!value.accessHash && !value.refreshHash) return null

      const rows = yield* execute(Schema.Array(AppSessionRow), () =>
        db
          .select()
          .from(appSessions)
          .where(
            and(
              value.accessHash
                ? eq(appSessions.accessHash, value.accessHash)
                : undefined,
              value.refreshHash
                ? eq(appSessions.refreshHash, value.refreshHash)
                : undefined,
              or(
                value.accessHash
                  ? gt(appSessions.accessExpiresAt, value.now)
                  : undefined,
                value.refreshHash
                  ? gt(appSessions.refreshExpiresAt, value.now)
                  : undefined,
              ),
            ),
          )
          .limit(1),
      )

      return rows[0] ?? null
    }),
    preserveCookies: Effect.fn("session.preserveCookies")(function* (
      input: typeof SessionLookup.Type,
    ) {
      const value = yield* decode(SessionLookup, input)

      if (!value.accessHash && !value.refreshHash) return false

      const rows = yield* execute(Schema.Array(AppSessionRow), () =>
        db
          .select()
          .from(appSessions)
          .where(
            or(
              and(
                value.accessHash
                  ? eq(appSessions.priorAccessHash, value.accessHash)
                  : undefined,
                value.refreshHash
                  ? eq(appSessions.priorRefreshHash, value.refreshHash)
                  : undefined,
                gt(appSessions.priorExpiresAt, value.now),
              ),
              and(
                value.accessHash
                  ? eq(appSessions.accessHash, value.accessHash)
                  : undefined,
                value.refreshHash
                  ? eq(appSessions.refreshHash, value.refreshHash)
                  : undefined,
                gt(appSessions.rotationStartedAt, value.now - 30000),
              ),
            ),
          )
          .limit(1),
      )

      return rows.length > 0
    }),
    // Do not release this claim on failure. The issuer can consume the token before failure.
    claimRotation: Effect.fn("session.claimRotation")(function* (
      input: typeof AppSessionRow.Type,
      now: number,
    ) {
      const row = yield* decode(AppSessionRow, input)
      const lookup = yield* decode(SessionLookup, { now })

      const rows = yield* execute(Schema.Array(AppSessionRow), () =>
        db
          .update(appSessions)
          .set({ rotationStartedAt: lookup.now })
          .where(
            and(
              eq(appSessions.id, row.id),
              eq(appSessions.accessHash, row.accessHash),
              eq(appSessions.refreshHash, row.refreshHash),
              isNull(appSessions.rotationStartedAt),
              gt(appSessions.refreshExpiresAt, lookup.now),
            ),
          )
          .returning(),
      )

      return rows.length === 1
    }),
    rotate: Effect.fn("session.rotate")(function* (
      previous: typeof AppSessionRow.Type,
      next: typeof AppSessionRow.Type,
    ) {
      const old = yield* decode(AppSessionRow, previous)
      const row = yield* decode(AppSessionRow, next)

      if (old.id !== row.id || old.userId !== row.userId) return false

      const rows = yield* execute(Schema.Array(AppSessionRow), () =>
        db
          .update(appSessions)
          .set(row)
          .where(
            and(
              eq(appSessions.id, old.id),
              eq(appSessions.userId, old.userId),
              eq(appSessions.accessHash, old.accessHash),
              eq(appSessions.refreshHash, old.refreshHash),
              gt(appSessions.rotationStartedAt, 0),
            ),
          )
          .returning(),
      )

      return rows.length === 1
    }),
    revoke: Effect.fn("session.revoke")(function* (
      input: typeof SessionHashes.Type,
    ) {
      const hashes = yield* decode(SessionHashes, input)

      if (!hashes.accessHash && !hashes.refreshHash) return
      yield* execute(Schema.Array(AppSessionRow), () =>
        db
          .delete(appSessions)
          .where(
            or(
              hashes.accessHash
                ? eq(appSessions.accessHash, hashes.accessHash)
                : undefined,
              hashes.refreshHash
                ? eq(appSessions.refreshHash, hashes.refreshHash)
                : undefined,
              hashes.accessHash
                ? eq(appSessions.priorAccessHash, hashes.accessHash)
                : undefined,
              hashes.refreshHash
                ? eq(appSessions.priorRefreshHash, hashes.refreshHash)
                : undefined,
            ),
          )
          .returning(),
      )
    }),
  }
}

export class SessionDb extends Context.Service<
  SessionDb,
  ReturnType<typeof makeSessionDb>
>()("social/SessionDb") {}

export function sessionDbLayer(database: D1Database) {
  return Layer.succeed(SessionDb, makeSessionDb(database))
}
