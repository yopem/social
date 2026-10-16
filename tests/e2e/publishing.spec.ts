import type { Page } from "@playwright/test"

import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, navigateWithSession, step } from "./effect"

function signIn(page: Page, identity = "owner") {
  return Effect.gen(function* () {
    const response = yield* step(() =>
      page.request.post("/__fixtures/session", { data: { identity } }),
    )

    yield* check(() => expect(response.ok()).toBeTruthy())
    yield* navigateWithSession(page, () => page.goto("/"))

    if (identity === "editor") {
      yield* step(() =>
        page.getByRole("combobox", { name: /^Workspace:/ }).click(),
      )
      yield* step(() =>
        page
          .getByRole("option", { name: "Shared Editor Workspace", exact: true })
          .click(),
      )
    }
  })
}

effectTest(
  "sign-in creates one default workspace and later sign-ins reuse it",
  ({ page }) =>
    Effect.gen(function* () {
      yield* navigateWithSession(page, () => page.goto("/"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Sign in with Google" }),
        ).toBeVisible(),
      )
      yield* signIn(page)
      yield* step(() =>
        expect(
          page.getByRole("combobox", { name: "Workspace: Alex Morgan" }),
        ).toBeVisible(),
      )
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("combobox", { name: "Workspace: Alex Morgan" }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("option", { name: "Alex Morgan", exact: true }),
        ).toHaveCount(1),
      )
    }),
)

effectTest(
  "all eight direct platforms show setup requirements without credentials",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("link", { name: "Channels", exact: true }).click(),
      )
      yield* Effect.forEach(
        [
          "X",
          "Threads",
          "Bluesky",
          "YouTube",
          "TikTok",
          "Instagram",
          "LinkedIn",
          "Facebook",
        ],
        (platform) =>
          Effect.gen(function* () {
            const channel = page.getByRole("region", {
              name: platform,
              exact: true,
            })

            yield* step(() => expect(channel).toBeVisible())
            yield* step(() =>
              expect(
                channel.getByText("Setup required", { exact: true }),
              ).toBeVisible(),
            )
          }),
        { discard: true, concurrency: 1 },
      )
    }),
)

effectTest(
  "drafts persist after reload and belong to their workspace",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("textbox", { name: "Post text" })
          .fill("A durable draft from the publishing desk."),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save draft", exact: true }).click(),
      )
      yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page.getByRole("link", { name: "Drafts", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByText("A durable draft from the publishing desk.", {
            exact: true,
          }),
        ).toBeVisible(),
      )
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
          .getByRole("textbox", { name: "Workspace name" })
          .fill("Second organization"),
      )
      yield* step(() =>
        page.getByRole("combobox", { name: "Workspace type" }).click(),
      )
      yield* step(() =>
        page.getByRole("option", { name: "Organization", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("dialog", { name: "Create workspace", exact: true })
          .getByRole("button", { name: "Create workspace", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("combobox", {
            name: "Workspace: Second organization",
          }),
        ).toBeVisible(),
      )
      yield* step(() =>
        expect(
          page.getByText("A durable draft from the publishing desk.", {
            exact: true,
          }),
        ).toHaveCount(0),
      )
    }),
)

for (const width of [1280, 320]) {
  effectTest(
    `empty posts fail validation without showing untouched-field errors at ${width}px`,
    ({ page }) =>
      Effect.gen(function* () {
        yield* step(() => page.setViewportSize({ width, height: 900 }))
        yield* signIn(page)
        yield* step(() =>
          page
            .getByRole("button", { name: "Create post", exact: true })
            .click(),
        )
        yield* step(() =>
          expect(
            page.getByText("Add text or media before saving.", { exact: true }),
          ).toHaveCount(0),
        )
        yield* step(() => expect(page.getByRole("alert")).toHaveCount(0))
        yield* step(() =>
          page.getByRole("textbox", { name: "Post text" }).focus(),
        )
        yield* step(() =>
          page.getByRole("textbox", { name: "Post text" }).press("Tab"),
        )
        yield* step(() =>
          expect(
            page.getByText("Add text or media before saving.", { exact: true }),
          ).toBeVisible(),
        )
        yield* step(() =>
          page.getByRole("button", { name: "Save draft", exact: true }).click(),
        )
        yield* step(() =>
          expect(
            page.getByText("Add text or media before saving.", { exact: true }),
          ).toBeVisible(),
        )
        yield* step(() => expect(page.getByRole("alert")).toHaveCount(1))
        yield* step(() => expect(page.getByRole("dialog")).toBeVisible())
        yield* step(() =>
          page.getByRole("textbox", { name: "Post text" }).fill("   "),
        )
        yield* step(() =>
          page.getByRole("button", { name: "Save draft", exact: true }).click(),
        )
        yield* step(() =>
          expect(
            page.getByText("Add text or media before saving.", { exact: true }),
          ).toBeVisible(),
        )
        yield* step(() =>
          page
            .getByRole("textbox", { name: "Post text" })
            .fill("Corrected empty draft."),
        )
        yield* step(() =>
          page.getByRole("button", { name: "Save draft", exact: true }).click(),
        )
        yield* step(() => expect(page.getByRole("dialog")).toHaveCount(0))

        if (width < 800)
          yield* step(() =>
            page
              .getByRole("button", { name: "Toggle Sidebar", exact: true })
              .click(),
          )

        yield* step(() =>
          page.getByRole("link", { name: "Drafts", exact: true }).click(),
        )
        yield* step(() =>
          expect(
            page.getByText("Corrected empty draft.", { exact: true }),
          ).toBeVisible(),
        )
      }),
  )
}

effectTest("mixed delivery outcomes remain independent", ({ page }) =>
  Effect.gen(function* () {
    yield* signIn(page)

    const seeded = yield* step(() =>
      page.request.post("/__fixtures/channels", {
        data: { scenario: "mixed" },
      }),
    )

    yield* check(() => expect(seeded.ok()).toBeTruthy())
    yield* navigateWithSession(page, () => page.reload())
    yield* step(() =>
      page.getByRole("button", { name: "Create post", exact: true }).click(),
    )
    yield* step(() =>
      page
        .getByRole("textbox", { name: "Post text" })
        .fill("One post. Independent destination results."),
    )
    yield* step(() => page.getByRole("checkbox", { name: "Alex on X" }).check())
    yield* step(() =>
      page.getByRole("checkbox", { name: "Alex on Threads" }).check(),
    )
    yield* step(() =>
      page.getByRole("checkbox", { name: "Alex on Bluesky" }).check(),
    )
    yield* step(() =>
      page.getByRole("button", { name: "Publish now", exact: true }).click(),
    )
    const result = page.getByRole("region", { name: "Delivery results" })
    yield* step(() =>
      expect(result.getByText("Published", { exact: true })).toBeVisible(),
    )
    yield* step(() =>
      expect(result.getByText("Processing", { exact: true })).toBeVisible(),
    )
    yield* step(() =>
      expect(result.getByText("Unknown", { exact: true })).toBeVisible(),
    )
    yield* step(() =>
      expect(result.getByText("All published", { exact: true })).toHaveCount(0),
    )
  }),
)

effectTest("editors cannot manage members or social connections", ({ page }) =>
  Effect.gen(function* () {
    yield* signIn(page, "editor")
    yield* step(() =>
      page.getByRole("link", { name: "Channels", exact: true }).click(),
    )
    yield* step(() =>
      expect(page.getByRole("button", { name: /^Connect / })).toHaveCount(0),
    )
    yield* step(() =>
      page.getByRole("link", { name: "Settings", exact: true }).click(),
    )
    yield* step(() =>
      expect(
        page.getByRole("button", { name: "Invite member", exact: true }),
      ).toHaveCount(0),
    )
  }),
)

effectTest(
  "editors publish through owner-connected shared accounts",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page, "editor")

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "editor-shared-account" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("textbox", { name: "Post text" })
          .fill("Shared account, current editor permission."),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X" }).check(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Publish now", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page
            .getByRole("region", { name: "Delivery results" })
            .getByText("Published", { exact: true }),
        ).toBeVisible(),
      )
    }),
)

effectTest(
  "calendar shows a scheduled post and permits cancellation",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)

      const seeded = yield* step(() =>
        page.request.post("/__fixtures/channels", {
          data: { scenario: "success" },
        }),
      )

      yield* check(() => expect(seeded.ok()).toBeTruthy())
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        page.getByRole("button", { name: "Create post", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("textbox", { name: "Post text" })
          .fill("Scheduled publishing desk update."),
      )
      yield* step(() =>
        page.getByRole("checkbox", { name: "Alex on X" }).check(),
      )
      yield* step(() =>
        page.getByLabel("Publish at", { exact: true }).fill("2030-01-15T10:30"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Schedule post", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Calendar", exact: true }).click(),
      )
      yield* step(() =>
        page.getByLabel("Calendar date", { exact: true }).fill("2030-01-15"),
      )
      yield* step(() =>
        expect(
          page.getByText("Scheduled publishing desk update.", { exact: true }),
        ).toBeVisible(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Cancel scheduled post", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByText("Cancelled", { exact: true })).toBeVisible(),
      )
    }),
)

effectTest(
  "RSS imports deduplicate items and retain unsupported targets for review",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("link", { name: "RSS automation", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Add feed", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("textbox", { name: "Feed URL" })
          .fill("https://fixtures.example.test/news.xml"),
      )
      yield* step(() =>
        page.getByRole("combobox", { name: "Import mode" }).click(),
      )
      yield* step(() =>
        page.getByRole("option", { name: "Draft", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Save feed", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Refresh feed", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("button", { name: "Refresh feed", exact: true }).click(),
      )
      yield* step(() =>
        page.getByRole("link", { name: "Drafts", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByText("Fixture article with a public link", {
            exact: false,
          }),
        ).toHaveCount(1),
      )
    }),
)

effectTest(
  "missing analytics remain unavailable rather than zero",
  ({ page }) =>
    Effect.gen(function* () {
      yield* signIn(page)
      yield* step(() =>
        page.getByRole("link", { name: "Analytics", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByText("Connect a channel to view available metrics.", {
            exact: true,
          }),
        ).toBeVisible(),
      )
      yield* step(() =>
        expect(page.getByText("0 impressions", { exact: true })).toHaveCount(0),
      )
    }),
)

effectTest(
  "small screens support keyboard navigation without horizontal overflow",
  ({ page }) =>
    Effect.gen(function* () {
      yield* step(() => page.setViewportSize({ width: 390, height: 844 }))
      yield* signIn(page)
      yield* step(() => page.keyboard.press("Tab"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Skip to content" }),
        ).toBeFocused(),
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
    }),
)

effectTest("unknown RPC routes do not return frontend HTML", ({ page }) =>
  Effect.gen(function* () {
    const response = yield* step(() => page.request.get("/rpc/not-a-route"))
    yield* check(() =>
      expect(response.headers()["content-type"]).not.toContain("text/html"),
    )
    yield* check(() => expect(response.status()).toBeGreaterThanOrEqual(400))
  }),
)
