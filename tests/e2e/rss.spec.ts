import { expect } from "@playwright/test"
import { Effect } from "effect"

import { check, effectTest, step } from "./effect"

effectTest("RSS rejects local URLs before making a network request", ({ page }) =>
  Effect.gen(function* () {
    const session = yield* step(() =>
      page.request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )
    yield* check(() => expect(session.ok()).toBeTruthy())
    yield* step(() => page.goto("/rss"))
    yield* step(() => page.getByRole("button", { name: "Add feed", exact: true }).click())
    yield* step(() => page.getByRole("textbox", { name: "Feed URL" }).fill("https://127.0.0.1/private.xml"))
    yield* step(() => page.getByRole("button", { name: "Save feed", exact: true }).click())
    yield* step(() => expect(page.getByText("Use a public HTTPS URL.", { exact: true })).toBeVisible())
    yield* step(() => expect(page.getByText("127.0.0.1", { exact: true })).toHaveCount(0))
  }),
)

effectTest("automatic RSS posts hold video-only destinations for review", ({ page }) =>
  Effect.gen(function* () {
    const session = yield* step(() =>
      page.request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )
    yield* check(() => expect(session.ok()).toBeTruthy())
    const channels = yield* step(() =>
      page.request.post("/__fixtures/channels", { data: { scenario: "video-required" } }),
    )
    yield* check(() => expect(channels.ok()).toBeTruthy())
    yield* step(() => page.goto("/rss"))
    yield* step(() => page.getByRole("button", { name: "Add feed", exact: true }).click())
    yield* step(() => page.getByRole("textbox", { name: "Feed URL" }).fill("https://fixtures.example.test/news.xml"))
    yield* step(() => page.getByRole("combobox", { name: "Import mode" }).selectOption("automatic"))
    yield* step(() => page.getByRole("checkbox", { name: "Alex on YouTube" }).check())
    yield* step(() => page.getByRole("button", { name: "Save feed", exact: true }).click())
    yield* step(() => page.getByRole("button", { name: "Refresh feed", exact: true }).click())
    yield* step(() => page.getByRole("link", { name: "Drafts", exact: true }).click())
    yield* step(() => expect(page.getByText("Needs review", { exact: true })).toBeVisible())
    yield* step(() => expect(page.getByText("YouTube requires video media.", { exact: false })).toBeVisible())
    yield* step(() => expect(page.getByText("Published", { exact: true })).toHaveCount(0))
  }),
)
