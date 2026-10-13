import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"

import { check, effectTest, step } from "./effect"

const RequestEnvelope = Schema.TaggedStruct("Request", {
  id: Schema.String,
  tag: Schema.String,
  headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
  payload: Schema.NullOr(
    Schema.Struct({
      confirmation: Schema.optional(Schema.String),
      workspaceId: Schema.optional(Schema.String),
    }),
  ),
})

function rpc(
  tag: string,
  payload: (typeof RequestEnvelope.Type)["payload"] = null,
) {
  return (
    JSON.stringify(
      RequestEnvelope.make({ id: "0", tag, headers: [], payload }),
    ) + "\n"
  )
}

for (const invalidate of ["delete", "logout"] as const) {
  effectTest(
    `old app cookies stay rejected after ${invalidate} and new sign-in`,
    ({ request }) =>
      Effect.gen(function* () {
        const signed = yield* step(() =>
          request.post("/__fixtures/session", { data: { identity: "owner" } }),
        )

        yield* check(() => expect(signed.ok()).toBeTruthy())

        const original = yield* step(() =>
          request.storageState().then((state) => state.cookies),
        )

        const cookie = original
          .filter((value) => value.name !== "fixture_namespace")
          .map((value) => `${value.name}=${value.value}`)
          .join("; ")

        const origin = "http://localhost:3200"

        const invalidated = yield* step(() =>
          invalidate === "delete"
            ? request.post("/rpc", {
                data: rpc("AccountDelete", { confirmation: "DELETE" }),
                headers: { origin, "content-type": "application/ndjson" },
              })
            : request.post("/auth/logout", { headers: { origin } }),
        )

        yield* check(() => expect(invalidated.ok()).toBeTruthy())

        const again = yield* step(() =>
          request.post("/__fixtures/session", { data: { identity: "owner" } }),
        )

        yield* check(() => expect(again.ok()).toBeTruthy())

        const replay = yield* step(() =>
          request.post("/rpc", {
            data: rpc("WorkspaceMembers", {
              workspaceId: "stale-session-probe",
            }),
            headers: { cookie, "content-type": "application/ndjson" },
          }),
        )

        yield* check(() => expect(replay.status()).toBe(401))
        yield* check(() =>
          expect(
            replay
              .headersArray()
              .filter((value) => value.name.toLowerCase() === "set-cookie")
              .map((value) => value.value)
              .join("\n"),
          ).toContain("Max-Age=0"),
        )
      }),
  )
}

for (const mode of ["expired-access", "expired-session"] as const) {
  effectTest(
    `local session ${mode} enforces durable expiry and rotation`,
    ({ request }) =>
      Effect.gen(function* () {
        yield* step(() =>
          request.post("/__fixtures/session", {
            data: { identity: "owner", mode },
          }),
        )

        const original = yield* step(() =>
          request.storageState().then((state) => state.cookies),
        )

        const cookie = original
          .map((value) => `${value.name}=${value.value}`)
          .join("; ")

        const read = yield* step(() =>
          request.post("/rpc", {
            data: rpc(
              mode === "expired-session" ? "WorkspaceMembers" : "SessionRead",
              mode === "expired-session"
                ? { workspaceId: "stale-session-probe" }
                : null,
            ),
            headers: { "content-type": "application/ndjson" },
          }),
        )

        if (mode === "expired-session") {
          yield* check(() => expect(read.status()).toBe(401))
        } else {
          yield* check(() => expect(read.ok()).toBeTruthy())

          const rotated = yield* step(() =>
            request.storageState().then((state) => state.cookies),
          )

          yield* check(() =>
            expect(
              rotated.find((value) => value.name === "access_token")?.value,
            ).not.toBe(
              original.find((value) => value.name === "access_token")?.value,
            ),
          )

          const persisted = yield* step(() =>
            request.post("/rpc", {
              data: rpc("SessionRead"),
              headers: { "content-type": "application/ndjson" },
            }),
          )

          yield* check(() => expect(persisted.ok()).toBeTruthy())
          const persistedBody = yield* step(() => persisted.text())
          yield* check(() => expect(persistedBody).not.toContain('"user":null'))

          const stale = yield* step(() =>
            request.post("/rpc", {
              data: rpc("WorkspaceMembers", {
                workspaceId: "stale-session-probe",
              }),
              headers: { cookie, "content-type": "application/ndjson" },
            }),
          )

          yield* check(() => expect(stale.status()).toBe(401))
        }
      }),
  )
}

effectTest(
  "parallel refresh keeps winning cookies and rejects stale tokens",
  ({ request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", {
          data: { identity: "owner", mode: "expired-access" },
        }),
      )
      const original = yield* step(() => request.storageState())

      const cookie = original.cookies
        .map((value) => `${value.name}=${value.value}`)
        .join("; ")

      const responses = yield* step(() =>
        Promise.all(
          [0, 1].map(() =>
            request.post("/rpc", {
              data: rpc("SessionRead"),
              headers: { cookie, "content-type": "application/ndjson" },
            }),
          ),
        ),
      )

      yield* check(() =>
        expect(responses.some((value) => value.ok())).toBeTruthy(),
      )

      for (const response of responses) {
        yield* check(() => expect([200, 401, 409]).toContain(response.status()))
        yield* check(() =>
          expect(
            response
              .headersArray()
              .filter((value) => value.name.toLowerCase() === "set-cookie")
              .some((value) => value.value.includes("Max-Age=0")),
          ).toBe(false),
        )
      }

      const stored = yield* step(() => request.storageState())

      for (const name of ["access_token", "refresh_token"]) {
        yield* check(() =>
          expect(
            stored.cookies.find((value) => value.name === name)?.value,
          ).toBeTruthy(),
        )
        yield* check(() =>
          expect(
            stored.cookies.find((value) => value.name === name)?.value,
          ).not.toBe(
            original.cookies.find((value) => value.name === name)?.value,
          ),
        )
      }

      const subsequent = yield* step(() =>
        request.post("/rpc", {
          data: rpc("SessionRead"),
          headers: { "content-type": "application/ndjson" },
        }),
      )

      yield* check(() => expect(subsequent.ok()).toBeTruthy())
      const subsequentBody = yield* step(() => subsequent.text())
      yield* check(() => expect(subsequentBody).not.toContain('"user":null'))

      const stale = yield* step(() =>
        request.post("/rpc", {
          data: rpc("WorkspaceMembers", { workspaceId: "stale-session-probe" }),
          headers: { cookie, "content-type": "application/ndjson" },
        }),
      )

      yield* check(() => expect(stale.status()).toBe(401))

      const afterStale = yield* step(() =>
        request.post("/rpc", {
          data: rpc("SessionRead"),
          headers: { "content-type": "application/ndjson" },
        }),
      )

      yield* check(() => expect(afterStale.ok()).toBeTruthy())
      const afterStaleBody = yield* step(() => afterStale.text())
      yield* check(() => expect(afterStaleBody).not.toContain('"user":null'))
    }),
)
