import type { D1Database } from "@cloudflare/workers-types"

import { and, eq, isNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { Effect, Schema } from "effect"

import { users } from "db/schema/accounts"
import {
  SocialIdempotencySelect,
  socialIdempotency,
} from "db/schema/channels/social"
import { PostsSelect, posts } from "db/schema/posts"
import { ApiError } from "rpc/lib/errors"

const Input = Schema.Struct({
  fixtureId: Schema.String.check(Schema.isUUID()),
  principalId: Schema.NonEmptyString,
})

const RemotePostInput = Schema.Struct({
  workspaceId: Schema.NonEmptyString,
  postId: Schema.NonEmptyString,
})

const scope = JSON.stringify(["credential-ready", "posts.publish"])

const ClaimRow = Schema.Struct({
  ...SocialIdempotencySelect.fields,
  scope: Schema.Literal(scope),
  targets: Schema.Literal(JSON.stringify(["fixture-x"])),
  tenant_id: Schema.Null,
  principal_id: Schema.NonEmptyString,
})

function failure() {
  return new ApiError({
    code: "storage-failure",
    message: "Deletion fixture failed.",
  })
}

function execute<A>(run: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: () => Promise.resolve(run()),
    catch: failure,
  })
}

export const seedLegacyOtherClaim = Effect.fn("seedLegacyOtherClaim")(
  function* (binding: D1Database, input: typeof Input.Type) {
    const value = yield* Schema.decodeUnknownEffect(Input)(input).pipe(
      Effect.mapError(failure),
    )

    const db = drizzle(binding)

    const principalRows = yield* execute(() =>
      db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, value.principalId)),
    ).pipe(
      Effect.flatMap((rows) =>
        Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ id: Schema.NonEmptyString })),
        )(rows).pipe(Effect.mapError(failure)),
      ),
    )

    if (principalRows.length !== 1)
      return yield* new ApiError({
        code: "invalid-input",
        message: "Legacy claim fixture requires a known principal.",
      })

    const row = yield* Schema.decodeUnknownEffect(ClaimRow)({
      id: value.fixtureId,
      scope,
      key: `legacy-other:${value.fixtureId}`,
      fingerprint: "fixture",
      targets: JSON.stringify(["fixture-x"]),
      tenant_id: null,
      principal_id: value.principalId,
    }).pipe(Effect.mapError(failure))

    const saved = yield* execute(() =>
      db.insert(socialIdempotency).values(row).returning(),
    ).pipe(
      Effect.flatMap((rows) =>
        Schema.decodeUnknownEffect(Schema.Array(ClaimRow))(rows).pipe(
          Effect.mapError(failure),
        ),
      ),
    )

    return saved[0] ? saved[0] : yield* failure()
  },
)

export const readLegacyOtherClaim = Effect.fn("readLegacyOtherClaim")(
  function* (binding: D1Database, input: typeof Input.Type) {
    const value = yield* Schema.decodeUnknownEffect(Input)(input).pipe(
      Effect.mapError(failure),
    )

    const db = drizzle(binding)

    const rows = yield* execute(() =>
      db
        .select()
        .from(socialIdempotency)
        .where(
          and(
            eq(socialIdempotency.id, value.fixtureId),
            eq(socialIdempotency.key, `legacy-other:${value.fixtureId}`),
            eq(socialIdempotency.scope, scope),
            eq(socialIdempotency.principal_id, value.principalId),
            isNull(socialIdempotency.tenant_id),
          ),
        )
        .limit(1),
    ).pipe(
      Effect.flatMap((result) =>
        Schema.decodeUnknownEffect(Schema.Array(ClaimRow))(result).pipe(
          Effect.mapError(failure),
        ),
      ),
    )

    return rows[0] ?? null
  },
)

export const readRemotePostRow = Effect.fn("readRemotePostRow")(function* (
  binding: D1Database,
  input: typeof RemotePostInput.Type,
) {
  const value = yield* Schema.decodeUnknownEffect(RemotePostInput)(input).pipe(
    Effect.mapError(failure),
  )

  const db = drizzle(binding)

  const rows = yield* execute(() =>
    db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.workspace_id, value.workspaceId),
          eq(posts.id, value.postId),
        ),
      )
      .limit(1),
  ).pipe(
    Effect.flatMap((result) =>
      Schema.decodeUnknownEffect(Schema.Array(PostsSelect))(result).pipe(
        Effect.mapError(failure),
      ),
    ),
  )

  return rows[0] ?? null
})
