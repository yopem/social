import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"

import {
  check,
  effectTest,
  navigateWithSession,
  responseJson,
  step,
} from "./effect"

effectTest(
  "owner transfers shared workspace before account deletion",
  ({ page, request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const setup = yield* step(() =>
        request.post("/__fixtures/deletion/setup", {
          data: { scenario: "shared-owner" },
        }),
      )

      yield* check(() => expect(setup.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.goto("/"))
      yield* step(() =>
        page.getByRole("combobox", { name: /^Workspace:/ }).click(),
      )
      yield* step(() =>
        page
          .getByRole("option", {
            name: "Deletion shared workspace",
            exact: true,
          })
          .click(),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Settings", exact: true }).click(),
      )
      yield* Effect.sync(() =>
        page.once("dialog", (dialog) => {
          void dialog.accept()
        }),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Transfer ownership", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByText("Ownership transferred.", { exact: true }),
        ).toBeVisible(),
      )
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        expect(page.locator("dd").filter({ hasText: /^admin$/ })).toBeVisible(),
      )
      yield* step(() =>
        expect(page.getByText(/Deletion peer · .* · owner$/)).toBeVisible(),
      )

      yield* step(() =>
        expect(
          page.getByRole("button", { name: "Transfer ownership", exact: true }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByLabel("Type DELETE to confirm").fill("DELETE"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByRole("link", { name: /sign in/i })).toBeVisible(),
      )
    }),
)

effectTest(
  "ownership transfer preserves owner and data on invalid targets and deletion race",
  ({ request }) =>
    Effect.gen(function* () {
      const session = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(session.status()).toBe(200))

      const checked = yield* step(() =>
        request.post("/__fixtures/ownership/guards"),
      )

      yield* check(() => expect(checked.status()).toBe(200))

      const result = yield* responseJson(
        checked,
        Schema.Struct({
          invalidTargetsProtected: Schema.Literal(true),
          raceProtected: Schema.Literal(true),
          owners: Schema.Literal(1),
          retainedPosts: Schema.Literal(1),
        }),
      )

      yield* check(() =>
        expect(result).toEqual({
          invalidTargetsProtected: true,
          raceProtected: true,
          owners: 1,
          retainedPosts: 1,
        }),
      )
    }),
)
