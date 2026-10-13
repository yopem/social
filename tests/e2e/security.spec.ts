import type { APIRequestContext } from "@playwright/test"

import { expect, test } from "@playwright/test"
import { Effect, Schema } from "effect"
import { createHmac } from "node:crypto"

import { Channel } from "rpc/contracts/models"

import { check, effectTest, responseJson, step } from "./effect"

function signIn(request: APIRequestContext) {
  return Effect.gen(function* () {
    const response = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    yield* check(() => expect(response.ok()).toBeTruthy())
  })
}

effectTest("private RPC requests require an app session", ({ request }) =>
  Effect.gen(function* () {
    const response = yield* step(() =>
      request.post("/rpc", {
        data: {},
        headers: { "content-type": "application/json" },
      }),
    )

    yield* check(() => expect(response.status()).toBe(401))
    yield* check(() =>
      expect(response.headers()["content-type"]).not.toContain("text/html"),
    )
  }),
)

effectTest("invalid app callback state creates no session", ({ request }) =>
  Effect.gen(function* () {
    const response = yield* step(() =>
      request.get("/auth/callback?code=invalid&state=invalid", {
        maxRedirects: 0,
      }),
    )

    yield* check(() => expect(response.status()).toBe(400))
    const state = yield* step(() => request.storageState())
    yield* check(() =>
      expect(
        state.cookies.some((cookie) => cookie.name === "access_token"),
      ).toBe(false),
    )
  }),
)

effectTest(
  "social discovery and callback replay cannot create extra account grants",
  ({ request }) =>
    Effect.gen(function* () {
      yield* signIn(request)

      const started = yield* step(() =>
        request.post("/__fixtures/connection/begin"),
      )

      yield* check(() => expect(started.ok()).toBeTruthy())

      const attempt = yield* responseJson(
        started,
        Schema.Struct({ id: Schema.String, state: Schema.String }),
      )

      const invalid = yield* step(() =>
        request.post("/__fixtures/connection/discover", {
          data: { id: attempt.id, state: "wrong-state" },
        }),
      )

      yield* check(() => expect(invalid.status()).toBe(400))

      const discovered = yield* step(() =>
        request.post("/__fixtures/connection/discover", {
          data: { id: attempt.id, state: attempt.state },
        }),
      )

      yield* check(() => expect(discovered.ok()).toBeTruthy())
      const grants = yield* step(() => request.get("/__fixtures/grants"))

      const before = yield* responseJson(
        grants,
        Schema.Struct({ count: Schema.Number }),
      )

      yield* check(() => expect(before.count).toBe(0))

      const selected = yield* step(() =>
        request.post("/__fixtures/connection/select", {
          data: { id: attempt.id, accountId: "fixture-x" },
        }),
      )

      yield* check(() => expect(selected.ok()).toBeTruthy())
      yield* step(() =>
        request.post("/__fixtures/connection/discover", {
          data: { id: attempt.id, state: attempt.state },
        }),
      )

      const stats = yield* step(() =>
        request.get("/__fixtures/connection/stats"),
      )

      const after = yield* responseJson(
        stats,
        Schema.Struct({ codeExchanges: Schema.Number, grants: Schema.Number }),
      )

      yield* check(() => expect(after).toEqual({ codeExchanges: 1, grants: 1 }))
    }),
)

effectTest(
  "duplicate queue delivery dispatches once and unknown outcomes need reconciliation",
  ({ request }) =>
    Effect.gen(function* () {
      yield* signIn(request)

      const response = yield* step(() =>
        request.post("/__fixtures/queue-delivery", {
          data: { duplicate: true, scenario: "unknown" },
        }),
      )

      yield* check(() => expect(response.ok()).toBeTruthy())

      const result = yield* responseJson(
        response,
        Schema.Struct({ dispatches: Schema.Number, state: Schema.String }),
      )

      yield* check(() => expect(result.dispatches).toBe(1))
      yield* check(() => expect(result.state).toBe("unknown"))
    }),
)

effectTest(
  "webhook signatures, duplicates, and unknown-account quarantine are enforced",
  ({ request }) =>
    Effect.gen(function* () {
      yield* signIn(request)

      const connected = yield* step(() =>
        request.post("/__fixtures/channels", {
          data: { scenario: "facebook" },
        }),
      )

      yield* check(() => expect(connected.ok()).toBeTruthy())

      const seeded = yield* responseJson(
        connected,
        Schema.Struct({ channels: Schema.Tuple([Channel]) }),
      )

      const [channel] = seeded.channels

      const inboxSchema = Schema.Struct({
        processed: Schema.Number,
        quarantined: Schema.Number,
      })

      const baselineResponse = yield* step(() =>
        request.get("/__fixtures/inbox"),
      )

      const baseline = yield* responseJson(baselineResponse, inboxSchema)

      const body = JSON.stringify({
        object: "page",
        entry: [
          {
            id: channel.accountId,
            time: 1791820800,
            changes: [
              {
                field: "feed",
                value: {
                  post_id: `${channel.accountId}_post`,
                  item: "post",
                  verb: "add",
                },
              },
            ],
          },
        ],
      })

      const signature = createHmac("sha256", "isolated-e2e-webhook-key")
        .update(body)
        .digest("hex")

      const invalid = yield* step(() =>
        request.post("/__fixtures/webhook", {
          data: body,
          headers: { "x-hub-signature-256": "sha256=invalid" },
        }),
      )

      yield* check(() => expect(invalid.status()).toBe(403))

      const accepted = yield* step(() =>
        request.post("/__fixtures/webhook", {
          data: body,
          headers: { "x-hub-signature-256": `sha256=${signature}` },
        }),
      )

      yield* check(() => expect(accepted.ok()).toBeTruthy())

      const duplicate = yield* step(() =>
        request.post("/__fixtures/webhook", {
          data: body,
          headers: { "x-hub-signature-256": `sha256=${signature}` },
        }),
      )

      yield* check(() => expect(duplicate.ok()).toBeTruthy())

      const unknownBody = JSON.stringify({
        object: "page",
        entry: [
          {
            id: `${channel.accountId}-unknown`,
            time: 1791820800,
            changes: [
              {
                field: "feed",
                value: {
                  post_id: `${channel.accountId}-unknown_post`,
                  item: "post",
                  verb: "add",
                },
              },
            ],
          },
        ],
      })

      const unknownSignature = createHmac("sha256", "isolated-e2e-webhook-key")
        .update(unknownBody)
        .digest("hex")

      const unmapped = yield* step(() =>
        request.post("/__fixtures/webhook", {
          data: unknownBody,
          headers: { "x-hub-signature-256": `sha256=${unknownSignature}` },
        }),
      )

      yield* check(() => expect(unmapped.ok()).toBeTruthy())
      const state = yield* step(() => request.get("/__fixtures/inbox"))

      const inbox = yield* responseJson(state, inboxSchema)

      yield* check(() =>
        expect(inbox).toEqual({
          processed: baseline.processed + 1,
          quarantined: baseline.quarantined + 1,
        }),
      )
    }),
)

effectTest("cross-origin mutations are rejected", ({ request }) =>
  Effect.gen(function* () {
    yield* signIn(request)

    const response = yield* step(() =>
      request.post("/rpc", {
        headers: {
          origin: "https://attacker.example",
          "content-type": "application/json",
        },
        data: {},
      }),
    )

    yield* check(() => expect(response.status()).toBe(403))
  }),
)

effectTest("logout removes both app session cookies", ({ request }) =>
  Effect.gen(function* () {
    yield* signIn(request)

    const origin = new URL(
      test.info().project.use.baseURL ?? "http://localhost:3200",
    ).origin

    const response = yield* step(() =>
      request.post("/auth/logout", { headers: { origin } }),
    )

    yield* check(() => expect(response.ok()).toBeTruthy())
    const state = yield* step(() => request.storageState())
    yield* check(() =>
      expect(
        state.cookies.some((cookie) =>
          ["access_token", "refresh_token"].includes(cookie.name),
        ),
      ).toBe(false),
    )
  }),
)
