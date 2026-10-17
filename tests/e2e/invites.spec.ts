import type { APIRequestContext } from "@playwright/test"
import type { Rpc, RpcGroup, RpcMessage } from "effect/rpc"

import { expect } from "@playwright/test"
import { Data, Effect, Schema } from "effect"
import { RpcSerialization } from "effect/rpc"

import type { AppRpc } from "rpc/app"
import { Session } from "rpc/contracts/session"
import { Workspace } from "rpc/contracts/workspaces"

import {
  check,
  effectTest,
  E2EFailure,
  navigateWithSession,
  responseJson,
  step,
} from "./effect"

function invitationRpc<
  A,
  Tag extends "WorkspaceInvite" | "WorkspaceAcceptInvite",
>(
  request: APIRequestContext,
  tag: Tag,
  payload: Rpc.Payload<Rpc.ExtractTag<RpcGroup.Rpcs<typeof AppRpc>, Tag>>,
  success: Schema.ConstraintDecoder<A>,
) {
  return Effect.gen(function* () {
    const parser = RpcSerialization.ndjson.makeUnsafe()

    const message = Data.taggedEnum<RpcMessage.RequestEncoded>().Request({
      id: tag,
      tag,
      headers: [],
      payload,
    })

    const body = yield* Schema.decodeUnknownEffect(Schema.String)(
      parser.encode(message),
    )

    const response = yield* step(() =>
      request.post("/rpc", {
        data: body,
        headers: { "content-type": "application/ndjson" },
      }),
    )

    yield* check(() => expect(response.ok()).toBeTruthy())
    const text = yield* step(() => response.text())

    const messages = yield* Effect.try({
      try: () => parser.decode(text),
      catch: (cause) => new E2EFailure({ message: String(cause) }),
    })

    const result = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        _tag: Schema.Literal("Exit"),
        requestId: Schema.Literal(tag),
        exit: Schema.Struct({
          _tag: Schema.Literal("Success"),
          value: success,
        }),
      }),
    )(messages[0])

    return result.exit.value
  }).pipe(
    Effect.mapError((cause) => new E2EFailure({ message: String(cause) })),
  )
}

function invitation(request: APIRequestContext) {
  return Effect.gen(function* () {
    const invitedResponse = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "outsider" } }),
    )

    const invited = yield* responseJson(invitedResponse, Session)

    const ownerResponse = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    const owner = yield* responseJson(ownerResponse, Session)

    const created = yield* invitationRpc(
      request,
      "WorkspaceInvite",
      {
        workspaceId: owner.workspaces[0].id,
        email: invited.user.email,
        role: "editor",
      },
      Schema.Struct({ url: Schema.String }),
    )

    return { url: created.url, workspace: owner.workspaces[0] }
  })
}

effectTest("create invite link from Settings", ({ page, request }) =>
  Effect.gen(function* () {
    const invitedResponse = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "outsider" } }),
    )

    const invited = yield* responseJson(invitedResponse, Session)
    yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )
    yield* navigateWithSession(page, () => page.goto("/settings"))
    yield* step(() =>
      page.getByRole("button", { name: "Invite member", exact: true }).click(),
    )
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

    yield* check(() => expect(new URL(url).pathname).toBe("/invite"))
    yield* check(() =>
      expect(new URL(url).searchParams.get("token")).toBeTruthy(),
    )
  }),
)

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
  "invite requires explicit acceptance, refreshes session and persists after reload",
  ({ page, request }) =>
    Effect.gen(function* () {
      const { url, workspace } = yield* invitation(request)
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "outsider" } }),
      )
      yield* navigateWithSession(page, () => page.goto(url))
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
      yield* navigateWithSession(page, () => page.reload())
      yield* step(() =>
        expect(
          page.getByRole("combobox", {
            name: `Workspace: ${workspace.name}`,
            exact: true,
          }),
        ).toBeVisible(),
      )
    }),
)

effectTest("accepted invitation cannot be reused", ({ page, request }) =>
  Effect.gen(function* () {
    const { url } = yield* invitation(request)
    yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "outsider" } }),
    )

    const token = yield* Schema.decodeUnknownEffect(Schema.String)(
      new URL(url).searchParams.get("token"),
    ).pipe(
      Effect.mapError(
        () => new E2EFailure({ message: "Missing invitation token" }),
      ),
    )

    yield* invitationRpc(request, "WorkspaceAcceptInvite", { token }, Workspace)
    yield* navigateWithSession(page, () => page.goto(url))
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
      const { url } = yield* invitation(request)
      yield* navigateWithSession(page, () => page.goto(url))
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
      yield* navigateWithSession(page, () => page.reload())
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
      yield* navigateWithSession(page, () =>
        page.goto(`/invite?token=${token}`),
      )
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
      const { url } = yield* invitation(request)
      yield* step(() =>
        page.route("**/rpc{,/}", (route) => {
          const headers = route.request().headers()

          if (route.request().postData()?.includes('"SessionRead"'))
            headers["x-fixture-auth-fault"] = "upstream"

          return route.continue({ headers })
        }),
      )
      yield* navigateWithSession(page, () => page.goto(url))
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
