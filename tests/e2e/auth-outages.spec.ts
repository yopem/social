import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"

import { check, effectTest, step } from "./effect"

const RequestEnvelope = Schema.TaggedStruct("Request", {
  id: Schema.String,
  tag: Schema.String,
  headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  payload: Schema.NullOr(
    Schema.Struct({ confirmation: Schema.optional(Schema.String) }),
  ),
})

for (const fault of ["upstream", "storage"] as const) {
  effectTest(
    `authentication ${fault} outage preserves cookies and permits retry`,
    ({ page, request }) =>
      Effect.gen(function* () {
        yield* step(() =>
          request.post("/__fixtures/session", { data: { identity: "owner" } }),
        )
        const before = yield* step(() => request.storageState())

        const failed = yield* step(() =>
          request.post("/__fixtures/auth-fault", {
            data: { fault },
          }),
        )

        yield* check(() =>
          expect(failed.status()).toBe(fault === "upstream" ? 502 : 500),
        )
        yield* check(() =>
          expect(
            failed
              .headersArray()
              .filter((header) => header.name.toLowerCase() === "set-cookie"),
          ).toEqual([]),
        )
        const after = yield* step(() => request.storageState())
        yield* check(() => expect(after.cookies).toEqual(before.cookies))
        yield* step(() => page.goto("/"))
        yield* step(() =>
          expect(
            page.getByRole("link", { name: "Settings", exact: true }),
          ).toBeVisible(),
        )
      }),
  )
}

effectTest(
  "anonymous session read stays public and protected RPC denies access",
  ({ request }) =>
    Effect.gen(function* () {
      const read = yield* step(() =>
        request.post("/rpc", {
          data:
            JSON.stringify(
              RequestEnvelope.make({
                id: "0",
                headers: [],
                tag: "SessionRead",
                payload: null,
              }),
            ) + "\n",
          headers: {
            origin: "http://localhost:3200",
            "content-type": "application/ndjson",
          },
        }),
      )

      yield* check(() => expect(read.ok()).toBeTruthy())
      const output = yield* step(() => read.text())
      yield* check(() => expect(output).toContain('"user":null'))
      yield* check(() => expect(output).toContain('"workspaces":[]'))

      const denied = yield* step(() =>
        request.post("/rpc", {
          data:
            JSON.stringify(
              RequestEnvelope.make({
                id: "0",
                headers: [],
                tag: "AccountDelete",
                payload: { confirmation: "DELETE" },
              }),
            ) + "\n",
          headers: {
            origin: "http://localhost:3200",
            "content-type": "application/ndjson",
          },
        }),
      )

      yield* check(() => expect(denied.status()).toBe(401))
      const denial = yield* step(() => denied.text())
      yield* check(() => expect(denial).toContain("unauthenticated"))
    }),
)

effectTest(
  "short issuer access lifetime refreshes before app cookie expiry",
  ({ request }) =>
    Effect.gen(function* () {
      const signIn = yield* step(() =>
        request.post("/__fixtures/session", {
          data: { identity: "owner", mode: "short-access" },
        }),
      )

      yield* check(() => expect(signIn.ok()).toBeTruthy())
      yield* check(() =>
        expect(
          signIn
            .headersArray()
            .filter((header) => header.name.toLowerCase() === "set-cookie")
            .map((header) => header.value)
            .join("\n"),
        ).toContain("Max-Age=86400"),
      )
      const before = yield* step(() => request.storageState())
      yield* Effect.sleep("1200 millis")

      const read = yield* step(() =>
        request.post("/rpc", {
          data:
            JSON.stringify(
              RequestEnvelope.make({
                id: "0",
                headers: [],
                tag: "SessionRead",
                payload: null,
              }),
            ) + "\n",
          headers: {
            origin: "http://localhost:3200",
            "content-type": "application/ndjson",
          },
        }),
      )

      yield* check(() => expect(read.ok()).toBeTruthy())
      const output = yield* step(() => read.text())
      yield* check(() => expect(output).not.toContain('"user":null'))
      const after = yield* step(() => request.storageState())
      yield* check(() =>
        expect(
          after.cookies.find((cookie) => cookie.name === "access_token")?.value,
        ).not.toBe(
          before.cookies.find((cookie) => cookie.name === "access_token")
            ?.value,
        ),
      )
    }),
)
