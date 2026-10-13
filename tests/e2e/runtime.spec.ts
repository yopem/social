import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, step } from "./effect"

effectTest(
  "one origin serves frontend assets and rejects unknown API routes",
  ({ page }) =>
    Effect.gen(function* () {
      yield* step(() => page.goto("/"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Sign in with Google" }),
        ).toBeVisible(),
      )

      const source = yield* step(() =>
        page.locator("script[src]").first().getAttribute("src"),
      )

      yield* check(() => expect(source).toBeTruthy())

      if (!source) return

      const assetUrl = new URL(source, page.url())

      yield* check(() =>
        expect(assetUrl.origin).toBe(new URL(page.url()).origin),
      )

      const asset = yield* step(() => page.request.get(assetUrl.href))

      yield* check(() => expect(asset.status()).toBe(200))
      yield* check(() =>
        expect(asset.headers()["content-type"]).toMatch(/javascript/),
      )
      yield* check(() =>
        expect(asset.headers()["content-type"]).not.toContain("text/html"),
      )

      yield* Effect.forEach(
        ["/rpc/missing", "/api/missing"],
        (path) =>
          Effect.gen(function* () {
            const response = yield* step(() => page.request.get(path))

            yield* check(() => expect(response.status()).toBe(404))
            yield* check(() =>
              expect(response.headers()["content-type"]).toContain(
                "application/json",
              ),
            )
            yield* check(() =>
              expect(response.headers()["content-type"]).not.toContain(
                "text/html",
              ),
            )
          }),
        { concurrency: 1, discard: true },
      )
    }),
)
