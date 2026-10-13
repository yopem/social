import type { Page } from "@playwright/test"

import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, step } from "./effect"

function openDesk(page: Page) {
  return step(async () => {
    await page.goto("/", { waitUntil: "commit" })

    const session = await page.waitForResponse(
      (response) =>
        ["/rpc", "/rpc/"].includes(new URL(response.url()).pathname) &&
        response.request().method() === "POST" &&
        Boolean(response.request().postData()?.includes('"SessionRead"')),
    )

    await session.finished()
    await expect(page.getByRole("status")).toHaveCount(0)
  })
}

for (const width of [1440, 390, 320]) {
  effectTest(`desk navigation stays accessible at ${width}px`, ({ page }) =>
    Effect.gen(function* () {
      const pageErrors: string[] = []
      page.on("pageerror", (error) => pageErrors.push(error.message))

      yield* step(() => page.setViewportSize({ width, height: 900 }))

      const response = yield* step(() =>
        page.request.post("/__fixtures/session", {
          data: { identity: "owner" },
        }),
      )

      yield* check(() => expect(response.ok()).toBeTruthy())
      yield* openDesk(page)

      const navigation = page.getByRole("navigation", {
        name: "Publishing",
        exact: true,
      })

      yield* step(() => expect(navigation).toBeVisible())
      yield* step(() => page.keyboard.press("Tab"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Skip to content" }),
        ).toBeFocused(),
      )
      yield* step(() => page.keyboard.press("Enter"))
      yield* step(() => expect(page.getByRole("main")).toBeFocused())

      for (const name of [
        "Queue",
        "Drafts",
        "Calendar",
        "Channels",
        "RSS automation",
        "Analytics",
        "Settings",
      ]) {
        const link = navigation.getByRole("link", { name, exact: true })
        yield* step(() => link.click())
        yield* step(() => expect(link).toHaveAttribute("aria-current", "page"))
        yield* step(() =>
          expect(navigation.locator('[aria-current="page"]')).toHaveCount(1),
        )
        yield* step(() =>
          expect(
            page.getByRole("main").getByRole("heading", { level: 1 }),
          ).toBeVisible(),
        )

        const size = yield* step(() =>
          page.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            content: document.documentElement.scrollWidth,
          })),
        )

        yield* check(() =>
          expect(size.content).toBeLessThanOrEqual(size.viewport),
        )
      }

      yield* check(() => expect(pageErrors).toEqual([]))

      yield* step(() =>
        page.screenshot({
          path: `test-results/desk-ui-${width}.png`,
          fullPage: true,
        }),
      )
    }),
  )
}

effectTest("anonymous desk exposes sign-in and legal links", ({ page }) =>
  Effect.gen(function* () {
    yield* step(() => page.setViewportSize({ width: 320, height: 720 }))
    yield* openDesk(page)
    yield* step(() =>
      expect(
        page.getByRole("heading", { name: "Publishing desk", level: 1 }),
      ).toBeVisible(),
    )
    yield* step(() =>
      expect(
        page.getByRole("link", { name: "Sign in with Google" }),
      ).toHaveAttribute("href", "/auth/login"),
    )
    yield* step(() =>
      expect(page.getByRole("link", { name: "Privacy Policy" })).toBeVisible(),
    )

    const size = yield* step(() =>
      page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      })),
    )

    yield* check(() => expect(size.content).toBeLessThanOrEqual(size.viewport))
  }),
)

effectTest("session loading announces workspace progress", ({ page }) =>
  Effect.gen(function* () {
    yield* step(() =>
      page.route("**/rpc{,/}", async (route) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 1500))
        await route.continue()
      }),
    )
    yield* step(() => page.goto("/"))
    yield* step(() =>
      expect(page.getByRole("status")).toHaveText("Loading your workspace…"),
    )
    yield* step(() =>
      expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true"),
    )
    yield* step(() =>
      expect(
        page.getByRole("link", { name: "Sign in with Google" }),
      ).toBeVisible(),
    )
  }),
)
