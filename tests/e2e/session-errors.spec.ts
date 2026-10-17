import { expect } from "@playwright/test"
import { Effect } from "effect"

import { Session } from "rpc/contracts/session"

import {
  check,
  effectTest,
  navigateWithSession,
  responseJson,
  step,
} from "./effect"

for (const fault of ["upstream", "storage"] as const) {
  for (const cached of [false, true]) {
    effectTest(
      `session ${fault} failure preserves ${cached ? "cached identity and " : ""}cookies until retry`,
      ({ page, request }) =>
        Effect.gen(function* () {
          const signedIn = yield* step(() =>
            request.post("/__fixtures/session", {
              data: { identity: "owner" },
            }),
          )

          yield* check(() => expect(signedIn.ok()).toBeTruthy())
          const session = yield* responseJson(signedIn, Session)
          const before = yield* step(() => request.storageState())

          if (cached) {
            yield* step(() => page.clock.install())
            yield* navigateWithSession(page, () => page.goto("/"))
            yield* step(() =>
              expect(
                page.getByRole("button", { name: "User menu", exact: true }),
              ).toBeVisible(),
            )
          }

          yield* step(() =>
            page.route("**/rpc{,/}", (route) => {
              const headers = route.request().headers()

              if (route.request().postData()?.includes('"SessionRead"'))
                headers["x-fixture-auth-fault"] = fault

              return route.continue({ headers })
            }),
          )

          const failedRead = step(() =>
            page.waitForResponse(
              (response) =>
                ["/rpc", "/rpc/"].includes(new URL(response.url()).pathname) &&
                response.status() === (fault === "upstream" ? 502 : 500),
            ),
          )

          const failed = yield* Effect.all(
            [
              failedRead,
              cached
                ? step(() => page.clock.fastForward(16_000)).pipe(
                    Effect.flatMap(() =>
                      step(() =>
                        page.evaluate(() =>
                          window.dispatchEvent(new Event("visibilitychange")),
                        ),
                      ),
                    ),
                  )
                : step(() => page.goto("/")),
            ],
            { concurrency: 2 },
          )

          const headers = yield* step(() => failed[0].headersArray())
          yield* check(() =>
            expect(
              headers.filter(
                (header) => header.name.toLowerCase() === "set-cookie",
              ),
            ).toEqual([]),
          )
          yield* step(() => expect(page.getByRole("alert")).toBeVisible())
          yield* step(() =>
            expect(
              page.getByRole("link", { name: "Sign in with Google" }),
            ).toHaveCount(0),
          )
          yield* step(() =>
            expect(
              page.getByRole("button", { name: "User menu", exact: true }),
            ).toHaveCount(cached ? 1 : 0),
          )

          if (cached)
            yield* step(() =>
              expect(
                page.getByRole("button", { name: "User menu", exact: true }),
              ).toContainText(session.user.name),
            )

          const afterFailure = yield* step(() => request.storageState())
          yield* check(() =>
            expect(afterFailure.cookies).toEqual(before.cookies),
          )

          yield* step(() => page.unroute("**/rpc{,/}"))
          yield* step(() =>
            page.getByRole("button", { name: "Retry", exact: true }).click(),
          )
          yield* step(() => expect(page.getByRole("alert")).toHaveCount(0))
          yield* step(() =>
            expect(
              page.getByRole("button", { name: "User menu", exact: true }),
            ).toBeVisible(),
          )
          yield* step(() =>
            expect(
              page.getByRole("link", { name: "Settings", exact: true }),
            ).toBeVisible(),
          )
          yield* step(() =>
            expect(
              page.getByRole("button", { name: "User menu", exact: true }),
            ).toContainText(session.user.name),
          )
          const afterRecovery = yield* step(() => request.storageState())
          yield* check(() =>
            expect(afterRecovery.cookies).toEqual(before.cookies),
          )
        }),
    )
  }
}

effectTest("successful anonymous session read shows sign-in", ({ page }) =>
  Effect.gen(function* () {
    yield* navigateWithSession(page, () => page.goto("/"))
    yield* step(() =>
      expect(
        page.getByRole("link", { name: "Sign in with Google" }),
      ).toBeVisible(),
    )
    yield* step(() => expect(page.getByRole("alert")).toHaveCount(0))
    yield* step(() =>
      expect(
        page.getByRole("button", { name: "Retry", exact: true }),
      ).toHaveCount(0),
    )
  }),
)
