import { Effect, Schema } from "effect"

class FixtureSetupError extends Schema.TaggedError<FixtureSetupError>()("FixtureSetupError", { message: Schema.String }) {}

export default function setup() {
  return Effect.runPromise(Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: () => fetch("http://localhost:3000/__fixtures/migrate", { method: "POST" }),
      catch: () => new FixtureSetupError({ message: "Start isolated Alchemy local Worker with SOCIAL_E2E=1 on http://localhost:3000 before E2E tests." }),
    })
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return yield* Effect.fail(new FixtureSetupError({ message: "Local fixture migration failed. Production Worker must not expose fixture routes." }))
    const result = yield* Effect.tryPromise({ try: () => response.json(), catch: () => new FixtureSetupError({ message: "Invalid migration response" }) })
    yield* Schema.decodeUnknown(Schema.Struct({ migrated: Schema.Literal(true) }))(result)
  }))
}
