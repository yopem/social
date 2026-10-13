import { expect } from "@playwright/test"
import { Effect } from "effect"
import { fileURLToPath } from "node:url"

import { check, effectTest, step } from "./effect"

effectTest("legal pages serve public HTML without a session", ({ page }) =>
  Effect.gen(function* () {
    yield* Effect.forEach(
      [
        { path: "/tos", title: "Terms of Service" },
        { path: "/privacy-policy", title: "Privacy Policy" },
      ],
      ({ path, title }) =>
        Effect.gen(function* () {
          const response = yield* step(() => page.request.get(path))
          const html = yield* step(() => response.text())

          yield* check(() => expect(response.status()).toBe(200))
          yield* check(() =>
            expect(response.headers()["content-type"]).toContain("text/html"),
          )
          yield* check(() => expect(html).toContain(title))
          yield* check(() => expect(html).toContain("Yopem Social"))
          yield* step(() => page.goto(path))
          yield* step(() => expect(page).toHaveTitle(`${title} | Yopem Social`))
          yield* step(() =>
            expect(
              page.getByRole("heading", { name: title, level: 1 }),
            ).toBeVisible(),
          )
          yield* step(() =>
            expect(
              page.getByRole("link", {
                name: "support@yopem.com",
                exact: true,
              }),
            ).toHaveAttribute("href", "mailto:support@yopem.com"),
          )
          yield* step(() =>
            expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
              "href",
              `https://social.yopem.com${path}`,
            ),
          )
        }),
      { concurrency: 1, discard: true },
    )
  }),
)

effectTest("sign-in and workspace navigation expose legal pages", ({ page }) =>
  Effect.gen(function* () {
    yield* step(() => page.goto("/"))
    yield* step(() =>
      page.getByRole("link", { name: "Terms of Service", exact: true }).click(),
    )
    yield* step(() => expect(page).toHaveURL(/\/tos$/))
    yield* step(() =>
      page
        .getByRole("navigation", { name: "Legal", exact: true })
        .getByRole("link", { name: "Privacy Policy", exact: true })
        .click(),
    )
    yield* step(() => expect(page).toHaveURL(/\/privacy-policy$/))
    yield* step(() =>
      page.getByRole("link", { name: "Publishing desk", exact: true }).click(),
    )

    const session = yield* step(() =>
      page.request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    yield* check(() => expect(session.ok()).toBeTruthy())
    yield* step(() => page.reload())
    yield* step(() =>
      expect(
        page.getByRole("link", { name: "Terms of Service", exact: true }),
      ).toBeVisible(),
    )
    yield* step(() =>
      page.getByRole("link", { name: "Privacy Policy", exact: true }).click(),
    )
    yield* step(() =>
      expect(
        page.getByRole("heading", {
          name: "Your choices and deletion",
          level: 2,
        }),
      ).toBeVisible(),
    )
    yield* step(() =>
      expect(
        page.getByRole("link", {
          name: "Google account permissions",
          exact: true,
        }),
      ).toHaveAttribute("href", "https://myaccount.google.com/permissions"),
    )
  }),
)

effectTest(
  "legal pages remain readable and keyboard accessible on mobile",
  ({ page }) =>
    Effect.gen(function* () {
      yield* step(() => page.setViewportSize({ width: 390, height: 844 }))
      yield* step(() => page.goto("/privacy-policy"))
      yield* step(() => page.keyboard.press("Tab"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Skip to content", exact: true }),
        ).toBeFocused(),
      )
      yield* step(() => page.keyboard.press("Enter"))
      yield* step(() => expect(page.getByRole("main")).toBeFocused())

      const size = yield* step(() =>
        page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          content: document.documentElement.scrollWidth,
        })),
      )

      yield* check(() =>
        expect(size.content).toBeLessThanOrEqual(size.viewport),
      )
      yield* step(() =>
        page.screenshot({
          path: fileURLToPath(
            new URL("../../test-results/legal-mobile.png", import.meta.url),
          ),
          fullPage: true,
        }),
      )
    }),
)
