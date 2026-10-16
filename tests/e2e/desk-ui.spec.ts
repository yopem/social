import type { Page } from "@playwright/test"

import { expect } from "@playwright/test"
import { Effect } from "effect"

import { Session } from "rpc/contracts/models"

import {
  check,
  effectTest,
  navigateWithSession,
  responseJson,
  step,
} from "./effect"

function openDesk(page: Page) {
  return navigateWithSession(page, () =>
    page.goto("/", { waitUntil: "commit" }),
  ).pipe(
    Effect.flatMap(() =>
      step(() => expect(page.getByRole("status")).toHaveCount(0)),
    ),
  )
}

for (const width of [1440, 800, 799, 390, 320]) {
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
      yield* step(() =>
        expect(
          page.getByRole("combobox", { name: "Channel filter", exact: true }),
        ).toHaveText("All channels"),
      )

      const navigation = page.getByRole("navigation", {
        name: "Publishing",
        exact: true,
      })

      if (width >= 800) yield* step(() => expect(navigation).toBeVisible())

      yield* step(() => page.keyboard.press("Tab"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Skip to content" }),
        ).toBeFocused(),
      )
      yield* step(() => page.keyboard.press("Enter"))
      yield* step(() => expect(page.getByRole("main")).toBeFocused())

      if (width >= 800) {
        yield* step(() =>
          page.getByRole("button", { name: "Toggle Sidebar" }).click(),
        )
        yield* step(() =>
          expect(
            page.locator('[data-slot="sidebar-container"]'),
          ).toHaveAttribute("inert", ""),
        )
        yield* step(() => expect(navigation).not.toBeInViewport())
        yield* step(() => page.keyboard.press("Shift+Tab"))
        yield* step(() =>
          expect(
            page.getByRole("link", { name: "Skip to content" }),
          ).toBeFocused(),
        )
        yield* step(() => page.keyboard.press("Tab"))
        yield* step(() =>
          expect(
            page.getByRole("button", { name: "Toggle Sidebar" }),
          ).toBeFocused(),
        )
        yield* step(() => page.keyboard.press("Enter"))
        yield* step(() => expect(navigation).toBeInViewport())
      }

      for (const name of [
        "Queue",
        "Drafts",
        "Calendar",
        "Channels",
        "RSS automation",
        "Analytics",
        "Settings",
      ]) {
        if (width < 800)
          yield* step(() =>
            page.getByRole("button", { name: "Toggle Sidebar" }).click(),
          )

        const link = navigation.getByRole("link", { name, exact: true })
        yield* step(() => expect(navigation).toBeVisible())
        yield* step(() => link.click())

        if (width < 800) {
          yield* step(() => expect(navigation).toBeHidden())
          yield* step(() =>
            page.getByRole("button", { name: "Toggle Sidebar" }).click(),
          )
        }

        yield* step(() => expect(link).toHaveAttribute("aria-current", "page"))
        yield* step(() =>
          expect(navigation.locator('[aria-current="page"]')).toHaveCount(1),
        )

        if (width < 800) {
          yield* step(() => page.keyboard.press("Escape"))
          yield* step(() => expect(navigation).toBeHidden())
        }

        yield* step(() =>
          expect(
            page.getByRole("main").getByRole("heading", { level: 1 }),
          ).toBeVisible(),
        )

        if (name === "Drafts" || name === "Calendar")
          yield* step(() => expect(page.getByRole("tabpanel")).toHaveCount(0))

        if (name === "Channels") {
          const x = page.getByRole("region", { name: "X", exact: true })

          const threads = page.getByRole("region", {
            name: "Threads",
            exact: true,
          })

          yield* step(() =>
            expect(x.getByText("Setup required", { exact: true })).toHaveCount(
              1,
            ),
          )
          yield* step(() =>
            expect(
              x.getByRole("button", { name: "Connect X", exact: true }),
            ).toBeDisabled(),
          )

          const first = yield* step(() => x.boundingBox())
          const second = yield* step(() => threads.boundingBox())

          yield* check(() => {
            expect(first).not.toBeNull()
            expect(second).not.toBeNull()

            if (first && second) {
              if (width >= 1024) {
                expect(second.y).toBeCloseTo(first.y, 0)
                expect(second.x).toBeGreaterThan(first.x)
              } else expect(second.y).toBeGreaterThan(first.y)
            }
          })
        }

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

for (const width of [1440, 390]) {
  effectTest(
    `user menu supports keyboard access and sign-out at ${width}px`,
    ({ page }) =>
      Effect.gen(function* () {
        yield* step(() => page.setViewportSize({ width, height: 900 }))

        const bootstrap = yield* step(() =>
          page.request.post("/__fixtures/session", {
            data: { identity: "owner" },
          }),
        )

        yield* check(() => expect(bootstrap.ok()).toBeTruthy())

        const name = "W".repeat(500)

        const response = yield* step(() =>
          page.request.post("/__fixtures/session", {
            data: { identity: "owner", name },
          }),
        )

        yield* check(() => expect(response.ok()).toBeTruthy())
        const session = yield* responseJson(response, Session)
        yield* check(() => expect(session.user.name).toBe(name))
        yield* openDesk(page)

        if (width < 800)
          yield* step(() =>
            page.getByRole("button", { name: "Toggle Sidebar" }).click(),
          )

        const trigger = page.getByRole("button", {
          name: "User menu",
          exact: true,
        })

        const menu = page.getByRole("menu", { name: "User menu", exact: true })

        yield* step(() => expect(trigger).toContainText(session.user.name))
        yield* step(() =>
          expect(
            page.getByRole("navigation", { name: "Legal", exact: true }),
          ).toHaveCount(0),
        )
        yield* step(() =>
          expect(
            page.getByRole("link", { name: "Terms of Service", exact: true }),
          ).toHaveCount(0),
        )
        yield* step(() =>
          expect(
            page.getByRole("link", { name: "Privacy Policy", exact: true }),
          ).toHaveCount(0),
        )
        yield* step(() => trigger.focus())
        yield* step(() => page.keyboard.press("ArrowDown"))
        yield* step(() => expect(menu).toBeVisible())
        yield* step(() =>
          expect(
            menu.getByText(session.user.name, { exact: true }),
          ).toBeVisible(),
        )
        const label = menu.getByText(name, { exact: true })

        yield* step(() => expect(label).toHaveText(name))
        yield* step(() => expect(label).toHaveCSS("overflow", "hidden"))
        yield* step(() => expect(label).toHaveCSS("text-overflow", "ellipsis"))
        yield* step(() => expect(label).toHaveCSS("white-space", "nowrap"))
        yield* step(() => expect(menu).toBeInViewport({ ratio: 1 }))

        const dimensions = yield* step(() =>
          label.evaluate((element) => ({
            width: element.clientWidth,
            content: element.scrollWidth,
          })),
        )

        yield* check(() => {
          expect(dimensions.width).toBeGreaterThan(0)
          expect(dimensions.content).toBeGreaterThan(dimensions.width)
        })
        yield* step(() => expect(menu).not.toContainText(session.user.id))
        yield* step(() => expect(menu).not.toContainText(session.user.email))
        yield* step(() =>
          expect(
            menu.getByRole("menuitem", { name: "Sign out", exact: true }),
          ).toBeFocused(),
        )
        yield* step(() =>
          page.screenshot({
            path: `test-results/user-menu-${width}.png`,
            fullPage: true,
          }),
        )
        yield* step(() => page.keyboard.press("Escape"))
        yield* step(() => expect(menu).toBeHidden())
        yield* step(() => expect(trigger).toBeFocused())

        if (width < 800)
          yield* step(() =>
            expect(
              page.getByRole("dialog", { name: "Sidebar", exact: true }),
            ).toBeVisible(),
          )

        yield* step(() => trigger.click())
        yield* step(() =>
          menu.getByRole("menuitem", { name: "Sign out", exact: true }).click(),
        )
        yield* step(() =>
          expect(
            page.getByRole("link", {
              name: "Sign in with Google",
              exact: true,
            }),
          ).toBeVisible(),
        )
        yield* step(() => expect(trigger).toHaveCount(0))
        yield* step(() => expect(menu).toHaveCount(0))
      }),
  )
}

effectTest("long workspace names fit a narrow desk", ({ page }) =>
  Effect.gen(function* () {
    yield* step(() => page.setViewportSize({ width: 320, height: 900 }))
    const name = "W".repeat(500)

    const response = yield* step(() =>
      page.request.post("/__fixtures/session", {
        data: { identity: "owner", name },
      }),
    )

    yield* check(() => expect(response.ok()).toBeTruthy())
    const session = yield* responseJson(response, Session)
    yield* check(() => expect(session.workspaces[0]?.name).toBe(name))
    yield* openDesk(page)

    const size = yield* step(() =>
      page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      })),
    )

    yield* check(() => expect(size.content).toBeLessThanOrEqual(size.viewport))
    yield* step(() =>
      page.getByRole("button", { name: "Toggle Sidebar", exact: true }).click(),
    )

    const workspace = page.getByRole("combobox", {
      name: `Workspace: ${name}`,
      exact: true,
    })

    const value = workspace.locator('[data-slot="select-value"]')

    yield* step(() => expect(workspace).toBeInViewport({ ratio: 1 }))
    yield* step(() => expect(value).toHaveText(name))
    yield* step(() => expect(value).toHaveCSS("text-overflow", "ellipsis"))

    const dimensions = yield* step(() =>
      value.evaluate((element) => ({
        width: element.clientWidth,
        content: element.scrollWidth,
      })),
    )

    yield* check(() => {
      expect(dimensions.width).toBeGreaterThan(0)
      expect(dimensions.content).toBeGreaterThan(dimensions.width)
    })
    yield* step(() =>
      page.screenshot({ path: "test-results/yopem-long-workspace-mobile.png" }),
    )
  }),
)

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

effectTest("post list separates loading and empty states", ({ page }) =>
  Effect.gen(function* () {
    const fixture = yield* step(() =>
      page.request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    yield* check(() => expect(fixture.ok()).toBeTruthy())

    const started = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()

    yield* step(() =>
      page.route("**/rpc{,/}", async (route) => {
        if (route.request().postData()?.includes('"PostListPage"')) {
          started.resolve()
          await released.promise
        }

        await route.continue()
      }),
    )
    yield* step(() => page.goto("/"))
    yield* step(() => started.promise)
    yield* step(() =>
      expect(page.getByRole("status")).toHaveText("Loading posts…"),
    )
    yield* step(() =>
      expect(
        page.getByText("No posts match this view.", { exact: true }),
      ).toHaveCount(0),
    )

    const response = page.waitForResponse(
      (item) =>
        ["/rpc", "/rpc/"].includes(new URL(item.url()).pathname) &&
        item.request().method() === "POST" &&
        Boolean(item.request().postData()?.includes('"PostListPage"')),
    )

    released.resolve()

    yield* step(() => response)
    yield* step(() =>
      expect(
        page.getByText("No posts match this view.", { exact: true }),
      ).toBeVisible(),
    )
    yield* step(() => expect(page.getByRole("status")).toHaveCount(0))
    yield* step(() =>
      page.screenshot({
        path: "test-results/yopem-posts-empty.png",
        fullPage: true,
      }),
    )
  }),
)

effectTest("session loading announces workspace progress", ({ page }) =>
  Effect.gen(function* () {
    const started = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()

    yield* step(() =>
      page.route("**/rpc{,/}", async (route) => {
        if (route.request().postData()?.includes('"SessionRead"')) {
          started.resolve()
          await released.promise
        }

        await route.continue()
      }),
    )
    yield* step(() => page.goto("/"))
    yield* step(() => started.promise)
    yield* step(() =>
      expect(page.getByRole("status")).toHaveText("Loading your workspace…"),
    )
    yield* step(() =>
      expect(page.getByRole("main")).toHaveAttribute("aria-busy", "true"),
    )

    const response = page.waitForResponse(
      (item) =>
        ["/rpc", "/rpc/"].includes(new URL(item.url()).pathname) &&
        item.request().method() === "POST" &&
        Boolean(item.request().postData()?.includes('"SessionRead"')),
    )

    released.resolve()

    yield* step(() => response)
    yield* step(() =>
      expect(
        page.getByRole("link", { name: "Sign in with Google" }),
      ).toBeVisible(),
    )
  }),
)
