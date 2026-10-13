import type { APIRequestContext, Page } from "@playwright/test"

import { expect } from "@playwright/test"
import { Effect } from "effect"

import { Session } from "rpc/contracts/models"

import { check, effectTest, responseJson, step } from "./effect"

function invitation(page: Page, request: APIRequestContext) {
  return Effect.gen(function* () {
    const invitedResponse = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "outsider" } }),
    )

    const invited = yield* responseJson(invitedResponse, Session)

    const ownerResponse = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    const owner = yield* responseJson(ownerResponse, Session)
    yield* step(() => page.goto("/settings"))
    yield* step(() =>
      page
        .getByLabel("Invitation email", { exact: true })
        .fill(invited.user.email),
    )
    yield* step(() =>
      page
        .getByRole("button", { name: "Create invite link", exact: true })
        .click(),
    )
    yield* step(() =>
      expect(page.getByLabel("Invite link", { exact: true })).toBeVisible(),
    )

    const url = yield* step(() =>
      page.getByLabel("Invite link", { exact: true }).inputValue(),
    )

    return { url, workspace: owner.workspaces[0] }
  })
}

for (const suffix of [
  "",
  "?token=",
  "?token=bad",
  `?token=${"x".repeat(513)}`,
  "?token=1&token=2",
]) {
  effectTest(
    `invalid invite search ${suffix.slice(0, 35)} shows back link`,
    ({ page }) =>
      Effect.gen(function* () {
        yield* step(() => page.goto(`/invite${suffix}`))
        yield* step(() =>
          expect(page.getByRole("alert")).toContainText(
            "Invalid invitation link",
          ),
        )
        yield* step(() =>
          expect(
            page.getByRole("link", { name: "Back to publishing desk" }),
          ).toBeVisible(),
        )
        yield* step(() =>
          expect(
            page.getByRole("button", { name: "Accept invitation" }),
          ).toHaveCount(0),
        )
      }),
  )
}

effectTest(
  "invite requires explicit acceptance, refreshes session and cannot be reused",
  ({ page, request }) =>
    Effect.gen(function* () {
      const { url, workspace } = yield* invitation(page, request)
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "outsider" } }),
      )
      yield* step(() => page.goto(url))
      yield* step(() =>
        expect(
          page.getByRole("button", { name: "Accept invitation", exact: true }),
        ).toBeVisible(),
      )
      yield* check(() => expect(new URL(page.url()).pathname).toBe("/invite"))
      yield* step(() =>
        page
          .getByRole("button", { name: "Accept invitation", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page).toHaveURL(new RegExp(`workspace=${workspace.id}`)),
      )
      yield* step(() =>
        expect(
          page.getByRole("combobox", {
            name: `Workspace: ${workspace.name}`,
            exact: true,
          }),
        ).toBeVisible(),
      )
      yield* step(() => page.reload())
      yield* step(() =>
        expect(
          page.getByRole("combobox", {
            name: `Workspace: ${workspace.name}`,
            exact: true,
          }),
        ).toBeVisible(),
      )
      yield* step(() => page.goto(url))
      yield* step(() =>
        page
          .getByRole("button", { name: "Accept invitation", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByRole("alert")).toContainText(
          "may be expired, already used, or intended for another email",
        ),
      )
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Back to publishing desk" }),
        ).toBeVisible(),
      )
    }),
)

effectTest(
  "wrong email cannot consume invitation; matching email can still accept",
  ({ page, request }) =>
    Effect.gen(function* () {
      const { url } = yield* invitation(page, request)
      yield* step(() => page.goto(url))
      yield* step(() =>
        page
          .getByRole("button", { name: "Accept invitation", exact: true })
          .click(),
      )
      yield* step(() => expect(page.getByRole("alert")).toBeVisible())
      yield* check(() => expect(new URL(page.url()).pathname).toBe("/invite"))
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "outsider" } }),
      )
      yield* step(() => page.reload())
      yield* step(() =>
        page
          .getByRole("button", { name: "Accept invitation", exact: true })
          .click(),
      )
      yield* step(() => expect(page).toHaveURL(/\/?workspace=/))
    }),
)

effectTest(
  "anonymous invitation login preserves local return target without accepting",
  ({ page }) =>
    Effect.gen(function* () {
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
      yield* step(() => page.goto(`/invite?token=${token}`))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Sign in with Google" }),
        ).toHaveAttribute(
          "href",
          `/auth/login?returnTo=${encodeURIComponent(`/invite?token=${token}`)}`,
        ),
      )
      yield* step(() =>
        expect(
          page.getByRole("button", { name: "Accept invitation" }),
        ).toHaveCount(0),
      )
    }),
)

effectTest(
  "invite session outage shows retry, not login or acceptance",
  ({ page, request }) =>
    Effect.gen(function* () {
      const { url } = yield* invitation(page, request)
      yield* step(() =>
        page.route("**/rpc{,/}", (route) => {
          const headers = route.request().headers()

          if (route.request().postData()?.includes('"SessionRead"'))
            headers["x-fixture-auth-fault"] = "upstream"

          return route.continue({ headers })
        }),
      )
      yield* step(() => page.goto(url))
      yield* step(() => expect(page.getByRole("alert")).toBeVisible())
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Sign in with Google" }),
        ).toHaveCount(0),
      )
      yield* step(() =>
        expect(
          page.getByRole("button", { name: "Accept invitation" }),
        ).toHaveCount(0),
      )
      yield* step(() => page.unroute("**/rpc{,/}"))
      yield* step(() =>
        page.getByRole("button", { name: "Retry", exact: true }).click(),
      )
      yield* step(() =>
        expect(
          page.getByRole("button", { name: "Accept invitation" }),
        ).toBeVisible(),
      )
    }),
)

for (const returnTo of [
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/%2f%2fevil.example",
  "/auth/callback",
  "/invite\n",
  "javascript:alert(1)",
]) {
  effectTest(
    `login rejects unsafe return target ${JSON.stringify(returnTo)}`,
    ({ request }) =>
      Effect.gen(function* () {
        const response = yield* step(() =>
          request.get(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`, {
            maxRedirects: 0,
          }),
        )

        yield* check(() => expect(response.status()).toBe(400))
        yield* check(() =>
          expect(response.headers()["location"]).toBeUndefined(),
        )
        yield* check(() =>
          expect(response.headers()["set-cookie"]).toBeUndefined(),
        )
      }),
  )
}

effectTest(
  "callback cannot use return target without matching OAuth attempt",
  ({ request }) =>
    Effect.gen(function* () {
      const response = yield* step(() =>
        request.get(
          "/auth/callback?state=invalid&code=invalid&returnTo=https://evil.example",
          { maxRedirects: 0 },
        ),
      )

      yield* check(() => expect(response.status()).toBe(400))
      yield* check(() => expect(response.headers()["location"]).toBeUndefined())
      const stored = yield* step(() => request.storageState())
      yield* check(() =>
        expect(
          stored.cookies.some((cookie) => cookie.name === "access_token"),
        ).toBe(false),
      )
    }),
)
