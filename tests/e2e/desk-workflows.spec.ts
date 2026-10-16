import type { Page } from "@playwright/test"

import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"
import { Buffer } from "node:buffer"

import {
  E2EFailure,
  check,
  effectTest,
  navigateWithSession,
  responseJson,
  step,
} from "./effect"

function createSession(page: Page) {
  return Effect.gen(function* () {
    const response = yield* step(() =>
      page.request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    yield* check(() => expect(response.ok()).toBeTruthy())
  })
}

function signIn(page: Page, path = "/") {
  return Effect.gen(function* () {
    yield* createSession(page)
    yield* navigateWithSession(page, () => page.goto(path))
  })
}

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1WQAAAAASUVORK5CYII=",
  "base64",
)

effectTest(
  "saved attachments can be inspected and removed after reload",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Post text").fill("Saved attachment workflow"),
      )
      yield* step(() =>
        page.getByLabel("Add images or video").setInputFiles({
          name: "workflow.png",
          mimeType: "image/png",
          buffer: image,
        }),
      )
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "workflow.png", exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Remove workflow.png", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByLabel("Add images or video").setInputFiles({
          name: "workflow.png",
          mimeType: "image/png",
          buffer: image,
        }),
      )
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "workflow.png", exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.goto("/drafts"))

      const article = page
        .getByRole("article")
        .filter({ hasText: "Saved attachment workflow" })

      yield* step(() => expect(article).toBeVisible())
      yield* step(() =>
        expect(
          page.getByText("No posts match this view.", { exact: true }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        article.getByRole("button", { name: "Edit post", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "workflow.png", exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Remove workflow.png", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByLabel("Post preview")).toContainText(
          "0 attachment(s)",
        ),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        article.getByRole("button", { name: "Edit post", exact: true }).click(),
      )
      yield* step(() =>
        expect(page.getByLabel("Post preview")).toContainText(
          "0 attachment(s)",
        ),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-media.png",
          fullPage: true,
        }),
      )
    }),
)

effectTest(
  "feed URL edits preserve custom names and retain unavailable targets for removal",
  ({ page }) =>
    Effect.gen(function* () {
      yield* createSession(page)

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "mixed" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.goto("/rss"))
      yield* step(() =>
        page.getByRole("button", { name: "Add feed", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByLabel("Feed URL", { exact: true })
          .fill("https://example.com/feed"),
      )
      yield* step(() =>
        page
          .getByLabel("Feed name", { exact: true })
          .fill("Custom workflow feed"),
      )
      yield* step(() =>
        page
          .getByLabel("Feed URL", { exact: true })
          .fill("https://example.org/feed"),
      )
      yield* step(() =>
        expect(page.getByLabel("Feed name", { exact: true })).toHaveValue(
          "Custom workflow feed",
        ),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X", exact: true }).check(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save feed", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* step(() =>
        page
          .getByRole("article")
          .filter({ hasText: "Custom workflow feed" })
          .getByRole("button", { name: "Edit feed", exact: true })
          .click(),
      )
      yield* step(() =>
        page
          .getByLabel("Feed URL", { exact: true })
          .fill("https://example.net/feed"),
      )
      yield* step(() =>
        expect(page.getByLabel("Feed name", { exact: true })).toHaveValue(
          "Custom workflow feed",
        ),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save feed", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* step(() =>
        page.getByRole("link", { name: "Channels", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Disconnect Alex on X", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("button", {
            name: "Disconnect Alex on X",
            exact: true,
          }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        page.getByRole("link", { name: "RSS automation", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("article")
          .filter({ hasText: "Custom workflow feed" })
          .getByRole("button", { name: "Edit feed", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("checkbox", { name: "Alex on X", exact: true }),
        ).toBeChecked(),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("checkbox", { name: "Alex on X", exact: true }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save feed", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page
          .getByRole("article")
          .filter({ hasText: "Custom workflow feed" })
          .getByRole("button", { name: "Edit feed", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByLabel("Feed URL", { exact: true })).toHaveValue(
          "https://example.net/feed",
        ),
      )
      yield* step(() =>
        expect(page.getByLabel("Feed name", { exact: true })).toHaveValue(
          "Custom workflow feed",
        ),
      )
      yield* step(() =>
        expect(
          page.getByRole("checkbox", { name: "Alex on Bluesky", exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        expect(
          page.getByRole("checkbox", { name: "Alex on X", exact: true }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-feed.png",
          fullPage: true,
        }),
      )
    }),
)

for (const { path, retries } of [
  {
    path: "/",
    retries: [
      ["channels", "ChannelList"],
      ["posts", "PostListPage"],
    ],
  },
  {
    path: "/drafts",
    retries: [
      ["channels", "ChannelList"],
      ["posts", "PostListPage"],
    ],
  },
  { path: "/channels", retries: [["channels", "ChannelList"]] },
  { path: "/rss", retries: [["feeds", "FeedList"]] },
  {
    path: "/analytics",
    retries: [
      ["analytics", "AnalyticsRead"],
      ["channels", "ChannelList"],
    ],
  },
  { path: "/settings", retries: [["members", "WorkspaceMembers"]] },
] as const) {
  effectTest(`workspace query failure offers retry on ${path}`, ({ page }) =>
    Effect.gen(function* () {
      const failedQueries = new Set<string>()

      yield* step(() =>
        page.route("**/rpc{,/}", async (route) => {
          const body = route.request().postData()

          if (body?.includes("SessionRead")) return route.continue()

          await route.abort("failed")

          for (const [, tag] of retries)
            if (body?.includes(`"tag":"${tag}"`)) failedQueries.add(tag)
        }),
      )
      yield* signIn(page, path)
      yield* step(() =>
        expect(
          page.getByRole("button", { name: /^Retry / }).first(),
        ).toBeVisible(),
      )

      if (path === "/" || path === "/drafts")
        yield* step(() =>
          expect(page.getByRole("button", { name: /^Retry / })).toHaveCount(2),
        )

      yield* step(() =>
        expect
          .poll(() => retries.every(([, tag]) => failedQueries.has(tag)))
          .toBeTruthy(),
      )
      yield* step(() => page.unroute("**/rpc{,/}"))

      for (const [name, tag] of retries) {
        const retry = page.getByRole("button", {
          name: `Retry ${name}`,
          exact: true,
        })

        yield* step(async () => {
          const [response] = await Promise.all([
            page.waitForResponse(
              (response) =>
                ["/rpc", "/rpc/"].includes(new URL(response.url()).pathname) &&
                response.request().method() === "POST" &&
                Boolean(
                  response.request().postData()?.includes(`"tag":"${tag}"`),
                ),
            ),
            retry.click(),
          ])

          expect(response.ok()).toBeTruthy()
          await response.finished()
          await expect(retry).toHaveCount(0)
        })
      }

      yield* step(() =>
        expect(page.getByRole("button", { name: /^Retry / })).toHaveCount(0),
      )
    }),
  )
}

effectTest(
  "queue keeps published results accessible through History",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "mixed" },
        }),
      )
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Post text").fill("Published history workflow"),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X", exact: true }).check(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Publish now", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* step(() =>
        expect(
          page
            .getByRole("article")
            .filter({ hasText: "Published history workflow" }),
        ).toContainText("Published"),
      )
      yield* step(() =>
        page.getByRole("tab", { name: "Queue", exact: true }).focus(),
      )
      yield* step(() => page.keyboard.press("ArrowRight"))
      yield* step(() =>
        expect(
          page
            .getByRole("article")
            .filter({ hasText: "Published history workflow" }),
        ).toContainText("Published"),
      )
      yield* step(() =>
        expect(
          page.getByRole("tab", { name: "History", exact: true }),
        ).toHaveAttribute("aria-selected", "true"),
      )
      yield* step(() =>
        page.getByRole("tab", { name: "Queue", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("tab", { name: "Queue", exact: true }),
        ).toHaveAttribute("aria-selected", "true"),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Drafts", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("heading", { name: "Drafts", exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-history.png",
          fullPage: true,
        }),
      )
    }),
)

effectTest(
  "calendar month navigation and selected-day list work on mobile",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() => page.setViewportSize({ width: 320, height: 800 }))
      yield* step(() =>
        page.getByRole("button", { name: "Toggle Sidebar" }).click(),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Calendar", exact: true }).click(),
      )

      const calendar = page.getByRole("region", {
        name: "Publication calendar",
        exact: true,
      })

      yield* step(() => expect(calendar).toBeVisible())

      const initialMonth = yield* step(() =>
        calendar.getByRole("heading", { level: 2 }).innerText(),
      )

      yield* step(() =>
        calendar
          .getByRole("button", { name: "Next month", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(calendar.getByRole("heading", { level: 2 })).not.toHaveText(
          initialMonth,
        ),
      )
      yield* step(() =>
        calendar
          .getByRole("button", { name: "Previous month", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(calendar.getByRole("heading", { level: 2 })).toHaveText(
          initialMonth,
        ),
      )
      yield* step(() =>
        calendar
          .getByRole("button", { name: /Select .*1,/ })
          .first()
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByLabel("Calendar date", { exact: true }),
        ).not.toHaveValue(""),
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
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-calendar.png",
          fullPage: true,
        }),
      )
    }),
)

effectTest("account confirmation clears attempt from URL", ({ page }) =>
  Effect.gen(function* () {
    yield* signIn(page)

    const started = yield* step(() =>
      page.request.post("/__fixtures/connection/begin"),
    )

    const attempt = yield* responseJson(
      started,
      Schema.Struct({ id: Schema.String, state: Schema.String }),
    )

    const discovered = yield* step(() =>
      page.request.post("/__fixtures/connection/discover", { data: attempt }),
    )

    yield* check(() => expect(discovered.ok()).toBeTruthy())
    yield* navigateWithSession(page, () =>
      page.goto(`/channels?attempt=${encodeURIComponent(attempt.id)}`),
    )
    yield* step(() =>
      page
        .getByRole("region", { name: "Discovered accounts", exact: true })
        .getByRole("checkbox")
        .first()
        .check(),
    )
    yield* step(() =>
      page
        .getByRole("button", { name: "Confirm selected accounts", exact: true })
        .click(),
    )
    yield* step(() => expect(page).not.toHaveURL(/attempt=/))
    yield* navigateWithSession(page, () => page.reload())
    yield* step(() =>
      expect(
        page.getByRole("region", { name: "Discovered accounts", exact: true }),
      ).toHaveCount(0),
    )
  }),
)

effectTest(
  "scheduled post edit keeps time and disconnected target can be removed",
  ({ page }) =>
    Effect.gen(function* () {
      yield* createSession(page)
      yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "mixed" },
        }),
      )
      yield* navigateWithSession(page, () => page.goto("/"))
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() => page.getByLabel("Post text").fill("Schedule workflow"))
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X", exact: true }).check(),
      )
      yield* step(() =>
        page.getByLabel("Publish at", { exact: true }).fill("2030-06-15T14:30"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Schedule post", exact: true })
          .click(),
      )

      const article = page
        .getByRole("article")
        .filter({ hasText: "Schedule workflow" })

      yield* step(() =>
        article.getByRole("button", { name: "Edit post", exact: true }).click(),
      )
      yield* step(() =>
        expect(page.getByLabel("Publish at", { exact: true })).toHaveValue(
          "2030-06-15T14:30",
        ),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Channels", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Disconnect Alex on X", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("button", {
            name: "Disconnect Alex on X",
            exact: true,
          }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Drafts", exact: true }).click(),
      )
      yield* step(() =>
        article.getByRole("button", { name: "Edit post", exact: true }).click(),
      )

      const disconnectedTarget = page.getByRole("checkbox", {
        name: "Alex on X",
        exact: true,
      })

      yield* step(() => expect(disconnectedTarget).toBeChecked())
      yield* step(() => disconnectedTarget.click())
      yield* step(() => expect(disconnectedTarget).toHaveCount(0))
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        article.getByRole("button", { name: "Edit post", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("checkbox", { name: "Alex on X", exact: true }),
        ).toHaveCount(0),
      )
    }),
)

effectTest(
  "workspace field errors are associated only after validation",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("combobox", { name: /^Workspace:/ }).click(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Create workspace", exact: true })
          .click(),
      )
      const name = page.getByLabel("Workspace name", { exact: true })
      yield* step(() =>
        expect(name).not.toHaveAttribute("aria-invalid", "true"),
      )
      yield* step(() => name.focus())
      yield* step(() => page.getByLabel("Timezone", { exact: true }).focus())
      yield* step(() => expect(name).toHaveAttribute("aria-invalid", "true"))
      yield* step(() => expect(name).toHaveAttribute("aria-describedby", /\S+/))
      yield* step(() => name.fill("Validated workflow workspace"))
      yield* step(() => page.getByLabel("Timezone", { exact: true }).focus())
      yield* step(() =>
        expect(name).not.toHaveAttribute("aria-invalid", "true"),
      )
    }),
)

effectTest(
  "server filtering finds older scheduled posts and excludes next-day boundary",
  ({ page }) =>
    Effect.gen(function* () {
      yield* createSession(page)

      const response = yield* step(() =>
        page.request.post("/__fixtures/backend-workflows/setup"),
      )

      const fixture = yield* responseJson(
        response,
        Schema.Struct({
          workspaceId: Schema.String,
          channelName: Schema.String,
          text: Schema.String,
          day: Schema.String,
        }),
      )

      yield* navigateWithSession(page, () =>
        page.goto(
          `/calendar?workspace=${encodeURIComponent(fixture.workspaceId)}`,
        ),
      )
      yield* step(() =>
        expect(
          page.getByRole("region", {
            name: "Publication calendar",
            exact: true,
          }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page.getByLabel("Calendar date", { exact: true }).fill(fixture.day),
      )
      yield* step(() =>
        page
          .getByRole("combobox", { name: "Channel filter", exact: true })
          .click(),
      )
      yield* step(() =>
        page
          .getByRole("option", { name: fixture.channelName, exact: true })
          .click(),
      )
      yield* step(() => expect(page.getByRole("article")).toHaveCount(1))
      yield* step(() =>
        expect(page.getByRole("article")).toContainText(fixture.text),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-filtered-calendar.png",
          fullPage: true,
        }),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Drafts", exact: true }).click(),
      )
      yield* step(() =>
        expect(page).toHaveURL(
          `/drafts?workspace=${encodeURIComponent(fixture.workspaceId)}`,
        ),
      )
      yield* step(() =>
        page.getByRole("button", { name: "All dates", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("combobox", { name: "Channel filter", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByRole("option", { name: "All channels", exact: true }).click(),
      )
      yield* step(() =>
        expect(page.getByLabel("Calendar date", { exact: true })).toHaveValue(
          "",
        ),
      )
      yield* step(() => expect(page.getByRole("article")).toHaveCount(50))
      yield* step(() =>
        page
          .getByRole("button", { name: "Load more posts", exact: true })
          .click(),
      )
      yield* step(() => expect(page.getByRole("article")).toHaveCount(100))
      yield* step(() =>
        page
          .getByRole("button", { name: "Load more posts", exact: true })
          .click(),
      )
      yield* step(() => expect(page.getByRole("article")).toHaveCount(105))
      yield* step(() =>
        expect(
          page.getByRole("button", { name: "Load more posts", exact: true }),
        ).toHaveCount(0),
      )
    }),
)

effectTest(
  "saving locks YouTube options with remaining composer controls",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "video-required" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Post text").fill("Locked options workflow"),
      )
      yield* step(() =>
        page
          .getByRole("checkbox", { name: "Alex on YouTube", exact: true })
          .check(),
      )
      yield* step(() =>
        page
          .getByLabel("YouTube title", { exact: true })
          .fill("Submitted title"),
      )
      yield* step(() =>
        page.route("**/rpc{,/}", async (route) => {
          if (route.request().postData()?.includes("PostSave"))
            await new Promise<void>((resolve) => setTimeout(resolve, 1500))
          await route.continue()
        }),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByLabel("YouTube title", { exact: true }),
        ).toBeDisabled(),
      )
      yield* step(() =>
        expect(
          page.getByRole("combobox", { name: "Made for kids", exact: true }),
        ).toBeDisabled(),
      )
      yield* step(() =>
        expect(
          page.getByRole("combobox", {
            name: "YouTube visibility",
            exact: true,
          }),
        ).toBeDisabled(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
    }),
)

effectTest(
  "calendar midnight-gap range excludes next civil day's first hour",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("combobox", { name: /^Workspace:/ }).click(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Create workspace", exact: true })
          .click(),
      )
      yield* step(() =>
        page
          .getByLabel("Workspace name", { exact: true })
          .fill("Santiago calendar workflow"),
      )
      yield* step(() =>
        page.getByLabel("Timezone", { exact: true }).fill("America/Santiago"),
      )
      yield* step(() =>
        page
          .getByRole("dialog")
          .getByRole("button", { name: "Create workspace", exact: true })
          .click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))

      const workspaceId = new URL(page.url()).searchParams.get("workspace")
      yield* check(() => expect(workspaceId).toBeTruthy())

      const seeded = yield* step(() =>
        page.request.post(
          `/__fixtures/backend-workflows/setup?workspace=${encodeURIComponent(workspaceId ?? "")}`,
          {
            data: {
              scheduledAt: "2027-09-05T04:00:00.000Z",
              boundaryAt: "2027-09-06T03:30:00.000Z",
            },
          },
        ),
      )

      const fixture = yield* responseJson(
        seeded,
        Schema.Struct({
          day: Schema.String,
          scheduledBefore: Schema.String,
          boundaryAt: Schema.String,
          text: Schema.String,
        }),
      )

      yield* check(() => expect(fixture.day).toBe("2027-09-05"))
      yield* check(() =>
        expect(fixture.scheduledBefore).toBe("2027-09-06T03:00:00.000Z"),
      )
      yield* check(() =>
        expect(fixture.boundaryAt).toBe("2027-09-06T03:30:00.000Z"),
      )

      yield* step(() =>
        page.getByRole("link", { name: "Calendar", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Calendar date", { exact: true }).fill("2027-09-05"),
      )
      yield* step(() => expect(page.getByRole("article")).toHaveCount(1))
      yield* step(() =>
        expect(page.getByRole("article")).toContainText(fixture.text),
      )
      yield* step(() =>
        page.getByLabel("Calendar date", { exact: true }).fill("2027-09-06"),
      )
      yield* step(() => expect(page.getByRole("article")).toHaveCount(1))
      yield* step(() =>
        expect(page.getByRole("article")).toContainText(fixture.text),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-santiago-calendar.png",
          fullPage: true,
        }),
      )
    }),
)

effectTest("uncertain publication stays visible in Queue", ({ page }) =>
  Effect.gen(function* () {
    yield* signIn(page)

    const seeded = yield* step(() =>
      page.request.post("/__fixtures/channels", {
        data: { scenario: "unknown" },
      }),
    )

    yield* check(() => expect(seeded.ok()).toBeTruthy())
    yield* navigateWithSession(page, () => page.reload())
    yield* step(() =>
      page.getByRole("button", { name: "Create post", exact: true }).click(),
    )
    yield* step(() =>
      page.getByLabel("Post text").fill("Uncertain visible outcome"),
    )
    yield* step(() =>
      page.getByRole("checkbox", { name: "Alex on X", exact: true }).check(),
    )
    yield* step(() =>
      page.getByRole("button", { name: "Publish now", exact: true }).click(),
    )
    yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
    yield* step(() =>
      expect(
        page.getByRole("tab", { name: "Queue", exact: true }),
      ).toHaveAttribute("aria-selected", "true"),
    )
    yield* step(() =>
      expect(
        page
          .getByRole("article")
          .filter({ hasText: "Uncertain visible outcome" }),
      ).toContainText("Publication is uncertain"),
    )
  }),
)

effectTest(
  "review-required publication exposes explicit Drafts review link",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "unknown" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page.route("**/rpc{,/}", async (route) => {
          if (!route.request().postData()?.includes("PostPublish"))
            return route.continue()
          const response = await route.fetch()

          const body = (await response.text()).replace(
            '"state":"pending"',
            '"state":"needs-review"',
          )

          await route.fulfill({ response, body })
        }),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Post text").fill("Review-required visible outcome"),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X", exact: true }).check(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Publish now", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* step(() =>
        expect(page.getByRole("status")).toContainText(
          "Review-required visible outcome",
        ),
      )
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Review in Drafts", exact: true }),
        ).toHaveAttribute("href", /\/drafts\?workspace=/),
      )
    }),
)

effectTest(
  "saved YouTube video publishes after reload without another upload",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "video-required" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.reload())

      const uploads: string[] = []
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/media/upload")
          uploads.push(request.url())
      })
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Post text").fill("Saved YouTube video workflow"),
      )
      yield* step(() =>
        page.getByLabel("Add images or video").setInputFiles({
          name: "saved-youtube.mp4",
          mimeType: "video/mp4",
          buffer: Buffer.from([
            0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50, 0, 0, 0, 0, 109,
            112, 52, 50, 105, 115, 111, 109,
          ]),
        }),
      )

      const attachment = page.getByRole("link", {
        name: "saved-youtube.mp4",
        exact: true,
      })

      yield* step(() => expect(attachment).toBeVisible())
      const mediaUrl = yield* step(() => attachment.getAttribute("href"))
      yield* check(() => expect(mediaUrl).toMatch(/^\/media\//))

      const mediaId = decodeURIComponent(
        (mediaUrl ?? "").split("/").at(-1) ?? "",
      )

      yield* check(() => expect(mediaId.length).toBeGreaterThan(0))
      yield* step(() =>
        page
          .getByRole("checkbox", { name: "Alex on YouTube", exact: true })
          .check(),
      )
      yield* step(() =>
        page
          .getByLabel("YouTube title", { exact: true })
          .fill("Saved YouTube title"),
      )
      yield* step(() =>
        page
          .getByRole("combobox", { name: "Made for kids", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByRole("option", { name: "No", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("combobox", { name: "YouTube visibility", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByRole("option", { name: "public", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.goto("/drafts"))
      yield* step(() =>
        page
          .getByRole("article")
          .filter({ hasText: "Saved YouTube video workflow" })
          .getByRole("button", { name: "Edit post", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(attachment).toHaveAttribute("href", mediaUrl ?? ""),
      )
      yield* step(() =>
        expect(
          page.getByRole("region", { name: "Post preview", exact: true }),
        ).toContainText("1 attachment(s)"),
      )
      yield* step(() =>
        expect(page.getByLabel("YouTube title", { exact: true })).toHaveValue(
          "Saved YouTube title",
        ),
      )
      yield* step(() =>
        expect(
          page.getByRole("combobox", { name: "Made for kids", exact: true }),
        ).toContainText("No"),
      )
      yield* step(() =>
        expect(
          page.getByRole("combobox", {
            name: "YouTube visibility",
            exact: true,
          }),
        ).toContainText("public"),
      )

      const saving = yield* step(async () => {
        const request = page.waitForRequest(
          (request) =>
            ["/rpc", "/rpc/"].includes(new URL(request.url()).pathname) &&
            Boolean(request.postData()?.includes('"tag":"PostSave"')),
        )

        await page
          .getByRole("button", { name: "Publish now", exact: true })
          .click()

        return request
      })

      const payload = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          tag: Schema.Literal("PostSave"),
          payload: Schema.Struct({
            content: Schema.Struct({ mediaIds: Schema.Array(Schema.String) }),
          }),
        }),
      )(saving.postDataJSON()).pipe(
        Effect.mapError(
          () =>
            new E2EFailure({
              message: "Saved YouTube media payload failed validation.",
            }),
        ),
      )

      yield* check(() =>
        expect(payload.payload.content.mediaIds).toEqual([mediaId]),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* check(() => expect(uploads).toHaveLength(1))
      yield* step(() =>
        page.getByRole("link", { name: "Queue", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("tab", { name: "History", exact: true }).click(),
      )

      const published = page
        .getByRole("article")
        .filter({ hasText: "Saved YouTube video workflow" })

      yield* step(() => expect(published).toContainText("Published"))
      yield* step(() => expect(published).toContainText("YouTube"))
      yield* step(() =>
        expect(
          published.getByRole("link", {
            name: "View published post",
            exact: true,
          }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-saved-youtube-video.png",
          fullPage: true,
        }),
      )
    }),
)

effectTest(
  "per-account caption persists and blank override restores shared text",
  ({ page }) =>
    Effect.gen(function* () {
      yield* createSession(page)

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "mixed" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.goto("/"))
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByLabel("Post text", { exact: true })
          .fill("Shared caption workflow"),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X", exact: true }).check(),
      )
      yield* step(() =>
        page
          .getByRole("checkbox", { name: "Alex on Threads", exact: true })
          .check(),
      )
      yield* step(() =>
        page
          .getByLabel("Text override for Alex on X", { exact: true })
          .fill("X account caption workflow"),
      )
      yield* step(() =>
        expect(
          page.getByLabel("Text override for Alex on Threads", { exact: true }),
        ).toHaveValue(""),
      )

      const preview = page.getByRole("region", {
        name: "Post preview",
        exact: true,
      })

      yield* step(() =>
        expect(preview).toContainText("Alex on X: X account caption workflow"),
      )
      yield* step(() =>
        expect(preview).toContainText(
          "Alex on Threads: Shared caption workflow",
        ),
      )

      const saving = yield* step(async () => {
        const request = page.waitForRequest(
          (request) =>
            ["/rpc", "/rpc/"].includes(new URL(request.url()).pathname) &&
            Boolean(request.postData()?.includes('"tag":"PostSave"')),
        )

        await page
          .getByRole("button", { name: "Save draft", exact: true })
          .click()

        return request
      })

      const captionRequest = Schema.Struct({
        tag: Schema.Literal("PostSave"),
        payload: Schema.Struct({
          content: Schema.Struct({
            text: Schema.String,
            overrides: Schema.Array(
              Schema.Struct({
                channelId: Schema.String,
                text: Schema.optional(Schema.String),
              }),
            ),
          }),
        }),
      })

      const payload = yield* Schema.decodeUnknownEffect(captionRequest)(
        saving.postDataJSON(),
      ).pipe(
        Effect.mapError(
          () =>
            new E2EFailure({
              message: "Caption save request failed validation.",
            }),
        ),
      )

      yield* check(() =>
        expect(payload.payload.content.text).toBe("Shared caption workflow"),
      )
      yield* check(() =>
        expect(
          payload.payload.content.overrides.filter(
            (override) => override.text !== undefined,
          ),
        ).toEqual([
          { channelId: expect.any(String), text: "X account caption workflow" },
        ]),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.goto("/drafts"))

      const draft = page
        .getByRole("article")
        .filter({ hasText: "Shared caption workflow" })

      yield* step(() =>
        draft.getByRole("button", { name: "Edit post", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByLabel("Text override for Alex on X", { exact: true }),
        ).toHaveValue("X account caption workflow"),
      )
      yield* step(() =>
        expect(
          page.getByLabel("Text override for Alex on Threads", { exact: true }),
        ).toHaveValue(""),
      )
      yield* step(() =>
        expect(preview).toContainText(
          "Alex on Threads: Shared caption workflow",
        ),
      )
      yield* step(() =>
        page
          .getByLabel("Text override for Alex on X", { exact: true })
          .fill(""),
      )
      yield* step(() =>
        expect(preview).toContainText("Alex on X: Shared caption workflow"),
      )

      const cleared = yield* step(async () => {
        const request = page.waitForRequest(
          (request) =>
            ["/rpc", "/rpc/"].includes(new URL(request.url()).pathname) &&
            Boolean(request.postData()?.includes('"tag":"PostSave"')),
        )

        await page
          .getByRole("button", { name: "Save draft", exact: true })
          .click()

        return request
      })

      const clearedPayload = yield* Schema.decodeUnknownEffect(captionRequest)(
        cleared.postDataJSON(),
      ).pipe(
        Effect.mapError(
          () =>
            new E2EFailure({
              message: "Cleared caption request failed validation.",
            }),
        ),
      )

      yield* check(() =>
        expect(
          clearedPayload.payload.content.overrides.every(
            (override) => override.text === undefined,
          ),
        ).toBeTruthy(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        draft.getByRole("button", { name: "Edit post", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByLabel("Text override for Alex on X", { exact: true }),
        ).toHaveValue(""),
      )
      yield* step(() =>
        page.screenshot({
          path: "test-results/desk-workflows-caption-overrides.png",
          fullPage: true,
        }),
      )
    }),
)
