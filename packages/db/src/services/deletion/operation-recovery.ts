import type { D1Database } from "@cloudflare/workers-types"

import { and, eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { Effect, Schema } from "effect"

import { accountOperations } from "db/schema/accounts/deletion"
import { ApiError } from "rpc/lib/errors"

const Recovery = Schema.Struct({
  userId: Schema.NonEmptyString,
  tokens: Schema.Array(Schema.NonEmptyString).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(32),
  ),
  confirmation: Schema.Literal("WORKER_AND_JOBS_STOPPED"),
})

// Call only after an operator stops the Worker and jobs and confirms no operation is in flight.
export function recoverAccountOperations(
  binding: D1Database,
  input: typeof Recovery.Type,
) {
  return Effect.fnUntraced(function* () {
    const recovery = yield* Schema.decodeUnknownEffect(Recovery)(input).pipe(
      Effect.mapError(
        () =>
          new ApiError({
            code: "invalid-input",
            message: "Confirm that the Worker and jobs have stopped.",
          }),
      ),
    )

    const db = drizzle(binding)

    const rows = yield* Effect.tryPromise({
      try: () =>
        db
          .delete(accountOperations)
          .where(
            and(
              eq(accountOperations.user_id, recovery.userId),
              inArray(accountOperations.token, [...recovery.tokens]),
            ),
          )
          .returning({ token: accountOperations.token }),
      catch: () =>
        new ApiError({
          code: "storage-failure",
          message: "Operation lease recovery failed.",
        }),
    }).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ token: Schema.String })),
        ),
      ),
      Effect.mapError((error) =>
        error instanceof ApiError
          ? error
          : new ApiError({
              code: "storage-failure",
              message: "Operation lease recovery result is invalid.",
            }),
      ),
    )

    return yield* Schema.decodeUnknownEffect(
      Schema.Struct({ released: Schema.Int }),
    )({ released: rows.length }).pipe(
      Effect.mapError(
        () =>
          new ApiError({
            code: "storage-failure",
            message: "Invalid operation recovery result.",
          }),
      ),
    )
  })()
}
