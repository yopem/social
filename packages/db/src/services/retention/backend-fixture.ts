import type { D1Database } from "@cloudflare/workers-types"

import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { DateTime, Effect, Schema } from "effect"

import {
  accountOperations,
  AccountOperationsInsert,
} from "db/schema/accounts/deletion"
import {
  socialAttempts,
  SocialAttemptsInsert,
  socialCredentials,
  SocialCredentialsInsert,
  socialRefreshLocks,
  SocialRefreshLocksInsert,
} from "db/schema/channels/social"
import { DatabaseRunResult } from "db/services/validation"
import { ApiError } from "rpc/lib/errors"

function failure() {
  return new ApiError({
    code: "storage-failure",
    message: "Backend fixture database failed.",
  })
}

export const seedBackendRetention = Effect.fn("seedBackendRetention")(
  function* (
    binding: D1Database,
    userId: string,
    workspaceId: string,
    heldWorkspace: string,
  ) {
    const db = drizzle(binding)
    const time = yield* DateTime.now
    const expired = DateTime.formatIso(DateTime.subtractDuration(time, 1800000))
    const fresh = DateTime.formatIso(DateTime.add(time, { hours: 1 }))
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID())
    const token = crypto.randomUUID()

    for (const [index, id] of ids.entries()) {
      const key = JSON.stringify(["attempt", id, "account"])

      const attempt = yield* Schema.decodeUnknownEffect(SocialAttemptsInsert)({
        id,
        tenant_id: index === 3 ? heldWorkspace : workspaceId,
        principal_id: index === 2 ? userId : `fixture:${id}`,
        platform: "facebook",
        state: id,
        expires_at: index === 1 ? fresh : expired,
        ciphertext: "fixture-ciphertext",
        discovery: null,
        consumed_token: null,
      }).pipe(Effect.mapError(failure))

      const credential = yield* Schema.decodeUnknownEffect(
        SocialCredentialsInsert,
      )({ key, revision: id, ciphertext: "fixture-ciphertext" }).pipe(
        Effect.mapError(failure),
      )

      const lock = yield* Schema.decodeUnknownEffect(SocialRefreshLocksInsert)({
        key,
        token: id,
        expires_at: fresh,
      }).pipe(Effect.mapError(failure))

      yield* Effect.tryPromise({
        try: () =>
          db.batch([
            db.insert(socialAttempts).values(attempt),
            db.insert(socialCredentials).values(credential),
            db.insert(socialRefreshLocks).values(lock),
          ]),
        catch: failure,
      }).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.Array(DatabaseRunResult)),
        ),
        Effect.mapError(failure),
      )
    }

    const operation = yield* Schema.decodeUnknownEffect(
      AccountOperationsInsert,
    )({
      token,
      user_id: userId,
      workspace_id: heldWorkspace,
      started_at: DateTime.formatIso(time),
    }).pipe(Effect.mapError(failure))

    yield* Effect.tryPromise({
      try: () => db.insert(accountOperations).values(operation),
      catch: failure,
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
      Effect.mapError(failure),
    )

    return {
      keys: ids.map((id) => JSON.stringify(["attempt", id, "account"])),
      ids,
      token,
    }
  },
)

export const inspectBackendRetention = Effect.fn("inspectBackendRetention")(
  function* (binding: D1Database, keys: readonly string[], token: string) {
    const db = drizzle(binding)

    const credentials = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ key: socialCredentials.key })
          .from(socialCredentials)
          .where(inArray(socialCredentials.key, [...keys])),
      catch: failure,
    }).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ key: Schema.String })),
        ),
      ),
      Effect.mapError(failure),
    )

    const locks = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ key: socialRefreshLocks.key })
          .from(socialRefreshLocks)
          .where(inArray(socialRefreshLocks.key, [...keys])),
      catch: failure,
    }).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ key: Schema.String })),
        ),
      ),
      Effect.mapError(failure),
    )

    yield* Effect.tryPromise({
      try: () =>
        db.delete(accountOperations).where(eq(accountOperations.token, token)),
      catch: failure,
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
      Effect.mapError(failure),
    )

    return {
      credentials: credentials.map((row) => row.key),
      locks: locks.map((row) => row.key),
    }
  },
)
