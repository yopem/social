import type { APIResponse, PlaywrightTestArgs } from "@playwright/test"

import { test } from "@playwright/test"
import { Effect, Schema } from "effect"

export class E2EFailure extends Schema.TaggedError<E2EFailure>()("E2EFailure", {
  message: Schema.String,
}) {}

export function step<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) =>
      new E2EFailure({
        message:
          cause instanceof Error ? cause.message : "Browser step failed.",
      }),
  })
}

export function check(run: () => void) {
  return Effect.try({
    try: run,
    catch: (cause) =>
      new E2EFailure({
        message: cause instanceof Error ? cause.message : "Assertion failed.",
      }),
  })
}

export function responseJson<A, I>(
  response: APIResponse,
  schema: Schema.Schema<A, I>,
) {
  return step(() => response.json()).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema)),
    Effect.mapError(
      () => new E2EFailure({ message: "Response failed schema validation." }),
    ),
  )
}

export function effectTest(
  title: string,
  scenario: (
    fixtures: Pick<PlaywrightTestArgs, "page" | "request">,
  ) => Effect.Effect<void, E2EFailure>,
) {
  test(title, ({ page, request }) =>
    Effect.runPromise(scenario({ page, request })),
  )
}
