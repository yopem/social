import type { D1Database } from "@cloudflare/workers-types"

import { count, eq, is, and, like } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { SQLiteTable } from "drizzle-orm/sqlite-core"
import { Effect, Schema } from "effect"

import * as identity from "db/schema/accounts"
import * as deletion from "db/schema/accounts/deletion"
import * as channels from "db/schema/channels"
import * as social from "db/schema/channels/social"
import * as feeds from "db/schema/feeds"
import * as media from "db/schema/media"
import * as posts from "db/schema/posts"
import * as session from "db/schema/session"
import * as workspaces from "db/schema/workspaces"
import { ApiError } from "rpc/lib/errors"
import { Id } from "rpc/lib/schema"

function storageError() {
  return new ApiError({
    code: "storage-failure",
    message: "Local fixture database operation failed",
  })
}

export function verifyLocalFixtureDatabase(db: D1Database, origin: string) {
  return Effect.fnUntraced(function* () {
    if (origin !== "http://localhost:3200")
      return yield* Effect.fail(
        new ApiError({
          code: "forbidden",
          message: "Fixture checks require local origin",
        }),
      )

    const client = drizzle(db)

    const tables = Object.values({
      ...identity,
      ...workspaces,
      ...channels,
      ...media,
      ...posts,
      ...feeds,
      ...social,
      ...deletion,
      ...session,
    }).filter((entry) => is(entry, SQLiteTable))

    if (tables.length === 0) return yield* storageError()
    yield* Effect.forEach(
      tables,
      (table) =>
        Effect.tryPromise({
          try: () => client.select().from(table).limit(1),
          catch: () =>
            new ApiError({
              code: "not-configured",
              message: "Apply Alchemy D1 migrations before running E2E tests.",
            }),
        }),
      { concurrency: 1, discard: true },
    )
  })()
}

export function fixtureDatabaseStats(db: D1Database, workspaceId: string) {
  return Schema.decodeUnknownEffect(Id)(workspaceId).pipe(
    Effect.mapError(
      () =>
        new ApiError({
          code: "invalid-input",
          message: "Invalid fixture workspace",
        }),
    ),
    Effect.flatMap((id) =>
      Effect.gen(function* () {
        const client = drizzle(db)

        const statements = [
          client
            .select({ value: count() })
            .from(social.socialGrants)
            .where(
              and(
                eq(social.socialGrants.tenant_id, id),
                eq(social.socialGrants.revoked, 0),
              ),
            ),
          client
            .select({ value: count() })
            .from(social.socialAttempts)
            .where(
              and(
                eq(social.socialAttempts.tenant_id, id),
                eq(social.socialAttempts.discovery_claimed, 1),
              ),
            ),
          client
            .select({ value: count() })
            .from(social.socialInbox)
            .where(eq(social.socialInbox.state, "complete")),
          client
            .select({ value: count() })
            .from(social.socialInbox)
            .where(eq(social.socialInbox.state, "quarantined")),
          client
            .select({ value: count() })
            .from(social.socialWorkflows)
            .where(
              and(
                eq(social.socialWorkflows.kind, "fixture-dispatch"),
                like(social.socialWorkflows.id, `${id}:%`),
              ),
            ),
        ] as const

        const result = yield* Effect.tryPromise({
          try: () => client.batch(statements),
          catch: storageError,
        })

        const row = Schema.Array(Schema.Struct({ value: Schema.Int }))

        const values = yield* Schema.decodeUnknownEffect(
          Schema.Tuple([row, row, row, row, row]),
        )(result).pipe(Effect.mapError(storageError))

        const [grants, exchanges, processed, quarantined, dispatches] =
          values.map((rows) => rows[0]?.value)

        return yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            grants: Schema.Int,
            codeExchanges: Schema.Int,
            processed: Schema.Int,
            quarantined: Schema.Int,
            dispatches: Schema.Int,
          }),
        )({
          grants,
          codeExchanges: exchanges,
          processed,
          quarantined,
          dispatches,
        }).pipe(Effect.mapError(storageError))
      }),
    ),
  )
}
