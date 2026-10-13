import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, step } from "./effect"

effectTest(
  "fixture requests share browser session cookies",
  ({ page, request }) =>
    Effect.gen(function* () {
      const session = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(session.status()).toBe(200))
      yield* step(() => page.goto("/"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Settings", exact: true }),
        ).toBeVisible(),
      )
    }),
)
