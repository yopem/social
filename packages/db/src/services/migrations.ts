import type { D1Database } from "@cloudflare/workers-types"

import { Effect, Schema } from "effect"

import { ApiError } from "rpc/contracts/models"

function storageError() {
  return new ApiError({
    code: "storage-failure",
    message: "Local fixture database operation failed",
  })
}

export function migrateLocalFixtures(
  db: D1Database,
  origin: string,
  statements: readonly string[],
) {
  return Effect.gen(function* () {
    if (origin !== "http://localhost:3000") {
      return yield* Effect.fail(
        new ApiError({
          code: "forbidden",
          message: "Fixture migrations require local origin",
        }),
      )
    }

    yield* Effect.tryPromise({
      try: () =>
        db.exec(
          "CREATE TABLE IF NOT EXISTS fixture_migrations (id INTEGER PRIMARY KEY)",
        ),
      catch: storageError,
    })

    for (const [index, statement] of statements.entries()) {
      const applied = yield* Effect.tryPromise({
        try: () =>
          db
            .prepare("SELECT id FROM fixture_migrations WHERE id=?")
            .bind(index)
            .first(),
        catch: storageError,
      })

      if (applied) continue

      const commands = statement
        .split(";")
        .map((command) => command.trim())
        .filter(Boolean)

      yield* Effect.tryPromise({
        try: () =>
          db.batch([
            ...commands.map((command) => db.prepare(command)),
            db
              .prepare("INSERT INTO fixture_migrations(id) VALUES(?)")
              .bind(index),
          ]),
        catch: storageError,
      })
    }
  })
}

export function fixtureDatabaseStats(db: D1Database, workspaceId: string) {
  return Effect.tryPromise({
    try: () =>
      db
        .prepare(
          "SELECT (SELECT count(*) FROM social_grants WHERE tenant_id=? AND revoked=0) AS grants, (SELECT count(*) FROM social_attempts WHERE tenant_id=? AND discovery_claimed=1) AS codeExchanges, (SELECT count(*) FROM social_inbox WHERE state='complete') AS processed, (SELECT count(*) FROM social_inbox WHERE state='quarantined') AS quarantined, (SELECT count(*) FROM social_workflows WHERE kind='fixture-dispatch' AND id LIKE ?) AS dispatches",
        )
        .bind(workspaceId, workspaceId, `${workspaceId}:%`)
        .first(),
    catch: storageError,
  }).pipe(
    Effect.flatMap(
      Schema.decodeUnknown(
        Schema.Struct({
          grants: Schema.Number,
          codeExchanges: Schema.Number,
          processed: Schema.Number,
          quarantined: Schema.Number,
          dispatches: Schema.Number,
        }),
      ),
    ),
    Effect.mapError(storageError),
  )
}
