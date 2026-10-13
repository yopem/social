import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, step } from "./effect"

effectTest(
  "TikTok shows creator preview and requires explicit choices",
  ({ page }) =>
    Effect.gen(function* () {
      const signedIn = yield* step(() =>
        page.request.post("/__fixtures/session", {
          data: { identity: "owner" },
        }),
      )

      yield* check(() => expect(signedIn.ok()).toBeTruthy())

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "tiktok" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* step(() => page.goto("/"))
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("checkbox", { name: "TikTok Creator", exact: true })
          .check(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "TikTok options", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByText("Creator preview", { exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        expect(
          page.getByText(/Maximum video duration: \d+ seconds\./),
        ).toBeVisible(),
      )
      yield* step(() => expect(page.getByRole("alert")).toHaveCount(0))
      yield* Effect.forEach(
        [
          "Privacy level",
          "Comments",
          "Duet",
          "Stitch",
          "Branded content",
          "Own brand",
          "AI-generated content",
          "Delivery mode",
        ],
        (label) =>
          step(() =>
            expect(
              page.getByRole("combobox", { name: label, exact: true }),
            ).toHaveText("Choose…"),
          ),
        { concurrency: 1, discard: true },
      )
      yield* step(() =>
        expect(
          page.getByRole("checkbox", {
            name: "I approve publishing to this TikTok account",
            exact: true,
          }),
        ).not.toBeChecked(),
      )
    }),
)
