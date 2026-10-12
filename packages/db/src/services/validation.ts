import { Effect, Schema } from "effect"

import { ApiError } from "rpc/contracts/models"

export const DatabaseRunResult = Schema.Struct({
  meta: Schema.Struct({
    changes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
})

export function validateOperation<Args extends unknown[], A, E, R, I, RD, RE>(
  operation: (...args: Args) => Effect.Effect<A, E, R>,
  schema: Schema.Codec<Readonly<Args>, I, RD, RE>,
) {
  return Effect.fnUntraced(function* validatedOperation(...args: Args) {
    const values = yield* Schema.decodeUnknownEffect(schema)(args).pipe(
      Effect.mapError(
        () =>
          new ApiError({
            code: "invalid-input",
            message: "Invalid database operation input.",
          }),
      ),
    )

    return yield* operation(...values)
  })
}
