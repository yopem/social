import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, step } from "./effect"

for (const scope of ["sole", "shared-grant"] as const) {
  for (const state of [
    "accepted",
    "processing",
    "unknown",
    "scheduled",
    ...(scope === "shared-grant" ? ["dispatching-without-result"] : []),
  ] as const) {
    effectTest(
      `remote ${state} blocks ${scope} deletion until resolved`,
      ({ page, request }) =>
        Effect.gen(function* () {
          const session = yield* step(() =>
            request.post("/__fixtures/session", {
              data: { identity: "owner" },
            }),
          )

          yield* check(() => expect(session.status()).toBe(200))

          const seeded = yield* step(() =>
            request.post("/__fixtures/deletion/remote", {
              data: { state, scope },
            }),
          )

          yield* check(() => expect(seeded.status()).toBe(200))
          yield* step(() => page.goto("/settings"))
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
              .getByRole("button", {
                name: "Delete account and data",
                exact: true,
              })
              .click(),
          )
          yield* step(() =>
            expect(
              page.getByText(
                "Publication must finish before account deletion.",
                { exact: true },
              ),
            ).toBeVisible(),
          )

          const unchanged = yield* step(() =>
            request.post("/__fixtures/deletion/remote-unchanged"),
          )

          yield* check(() => expect(unchanged.status()).toBe(200))

          const resolved = yield* step(() =>
            request.post("/__fixtures/deletion/remote-resolve"),
          )

          yield* check(() => expect(resolved.status()).toBe(200))
          yield* step(() =>
            page
              .getByRole("button", {
                name: "Delete account and data",
                exact: true,
              })
              .click(),
          )
          yield* step(() =>
            expect(page.getByRole("link", { name: /sign in/i })).toBeVisible(),
          )

          const purged = yield* step(() =>
            request.post("/__fixtures/deletion/verify"),
          )

          yield* check(() => expect(purged.status()).toBe(200))
        }),
    )
  }
}

effectTest(
  "known other principal legacy work does not block account deletion",
  ({ page, request }) =>
    Effect.gen(function* () {
      const session = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(session.status()).toBe(200))

      const setup = yield* step(() =>
        request.post("/__fixtures/deletion/setup", {
          data: { scenario: "sole" },
        }),
      )

      yield* check(() => expect(setup.status()).toBe(200))

      const legacy = yield* step(() =>
        request.post("/__fixtures/deletion/legacy-other"),
      )

      yield* check(() => expect(legacy.status()).toBe(200))
      yield* step(() => page.goto("/settings"))
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

      const verified = yield* step(() =>
        request.post("/__fixtures/deletion/verify"),
      )

      yield* check(() => expect(verified.status()).toBe(200))

      const retained = yield* step(() =>
        request.post("/__fixtures/deletion/legacy-other-retained"),
      )

      yield* check(() => expect(retained.status()).toBe(200))
    }),
)
