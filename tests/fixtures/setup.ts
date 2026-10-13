import { Effect, Schema } from "effect"

class FixtureSetupError extends Schema.TaggedError<FixtureSetupError>()(
  "FixtureSetupError",
  { message: Schema.String },
) {}

export default function setup() {
  return Effect.runPromise(
    Effect.gen(function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          fetch("http://localhost:3200/__fixtures/ready", {
            method: "GET",
            headers: { Origin: "http://localhost:3200" },
          }),
        catch: () =>
          new FixtureSetupError({
            message:
              "Start isolated Alchemy local Worker with SOCIAL_E2E=1 on http://localhost:3200 before E2E tests.",
          }),
      })

      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("application/json")
      )
        return yield* Effect.fail(
          new FixtureSetupError({
            message:
              "Local fixture database is not ready. Apply Alchemy migrations before tests. Production Worker must not expose fixture routes.",
          }),
        )

      const result = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: () =>
          new FixtureSetupError({
            message: "Invalid fixture readiness response",
          }),
      })

      yield* Schema.decodeUnknownEffect(
        Schema.Struct({ ready: Schema.Literal(true) }),
      )(result)
    }),
  )
}
