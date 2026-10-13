import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"
import { request as httpRequest } from "node:http"

import { check, effectTest, step, responseJson } from "./effect"

for (const scenario of ["sole", "shared-owner", "shared-member"] as const) {
  effectTest(`account deletion: ${scenario}`, ({ page, request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const setup = yield* step(() =>
        request.post("/__fixtures/deletion/setup", { data: { scenario } }),
      )

      yield* check(() => expect(setup.ok()).toBeTruthy())
      yield* step(() => page.goto("/"))
      yield* step(() =>
        page.getByRole("link", { name: "Settings", exact: true }).click(),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByLabel("Type DELETE to confirm").fill("DELETE"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )

      if (scenario === "shared-owner") {
        yield* step(() =>
          expect(
            page.getByText(
              "Transfer ownership of shared workspaces before deleting your account.",
            ),
          ).toBeVisible(),
        )
      } else {
        yield* step(() =>
          expect(page.getByRole("link", { name: /sign in/i })).toBeVisible(),
        )
      }

      const verified = yield* step(() =>
        request.post("/__fixtures/deletion/verify", { data: { scenario } }),
      )

      yield* check(() => expect(verified.ok()).toBeTruthy())
      yield* check(() => expect(verified.status()).toBe(200))
    }),
  )
}

effectTest(
  "in-flight upload and connection block deletion without data loss",
  ({ page, request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const setup = yield* step(() =>
        request.post("/__fixtures/deletion/setup", {
          data: { scenario: "sole" },
        }),
      )

      const { workspaceId } = yield* responseJson(
        setup,
        Schema.Struct({ workspaceId: Schema.String }),
      )

      const cookies = yield* step(() => page.context().cookies())

      const cookie = cookies
        .map((value) => `${value.name}=${value.value}`)
        .join("; ")

      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==",
        "base64",
      )

      const upload = httpRequest(
        `http://localhost:3200/media/upload?workspace=${workspaceId}`,
        {
          method: "POST",
          headers: {
            cookie,
            origin: "http://localhost:3200",
            "content-type": "image/png",
            "content-length": bytes.length,
            "x-file-name": "held.png",
          },
        },
      )

      const completed = new Promise<number>((resolve, reject) => {
        upload.on("response", (response) => {
          response.resume()
          resolve(response.statusCode ?? 0)
        })
        upload.on("error", reject)
      })

      upload.write(bytes.subarray(0, 16))
      yield* step(() =>
        expect
          .poll(async () => {
            const status = await request.post("/__fixtures/deletion/status")
            const value: unknown = await status.json()

            return Schema.decodeUnknownSync(
              Schema.Struct({
                operations: Schema.Array(
                  Schema.Struct({ token: Schema.String }),
                ),
              }),
            )(value).operations.length
          })
          .toBeGreaterThan(0),
      )
      const lease = yield* step(() => request.post("/__fixtures/deletion/hold"))
      yield* check(() => expect(lease.ok()).toBeTruthy())
      yield* step(() => page.goto("/settings"))
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByLabel("Type DELETE to confirm").fill("DELETE"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByText(
            "An account operation is still active. Wait for it to finish, then retry deletion.",
          ),
        ).toBeVisible(),
      )
      upload.end(bytes.subarray(16))
      const uploaded = yield* step(() => completed)
      yield* check(() => expect(uploaded).toBe(200))

      const released = yield* step(() =>
        request.post("/__fixtures/deletion/release"),
      )

      yield* check(() => expect(released.ok()).toBeTruthy())
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByRole("link", { name: /sign in/i })).toBeVisible(),
      )

      const verified = yield* step(() =>
        request.post("/__fixtures/deletion/verify"),
      )

      yield* check(() => expect(verified.ok()).toBeTruthy())
    }),
)

effectTest(
  "abandoned operation recovery requires explicit operator confirmation",
  ({ request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )
      yield* step(() =>
        request.post("/__fixtures/deletion/setup", {
          data: { scenario: "sole" },
        }),
      )
      const held = yield* step(() => request.post("/__fixtures/deletion/hold"))
      yield* check(() => expect(held.ok()).toBeTruthy())

      const denied = yield* step(() =>
        request.post("/__fixtures/deletion/recover", {
          data: { confirmation: "NOT_CONFIRMED" },
        }),
      )

      yield* check(() => expect(denied.status()).toBe(400))

      const recovered = yield* step(() =>
        request.post("/__fixtures/deletion/recover", {
          data: { confirmation: "WORKER_AND_JOBS_STOPPED" },
        }),
      )

      yield* check(() => expect(recovered.ok()).toBeTruthy())

      const status = yield* step(() =>
        request.post("/__fixtures/deletion/status"),
      )

      const value = yield* responseJson(
        status,
        Schema.Struct({
          operations: Schema.Array(Schema.Struct({ token: Schema.String })),
        }),
      )

      yield* check(() => expect(value.operations).toHaveLength(0))
    }),
)

effectTest(
  "account deletion resumes after a durable fence and page reload",
  ({ page, request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const setup = yield* step(() =>
        request.post("/__fixtures/deletion/setup", {
          data: { scenario: "sole" },
        }),
      )

      yield* check(() => expect(setup.ok()).toBeTruthy())

      const fenced = yield* step(() =>
        request.post("/__fixtures/deletion/freeze"),
      )

      yield* check(() => expect(fenced.ok()).toBeTruthy())
      yield* step(() => page.goto("/settings"))
      yield* step(() => page.reload())
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByLabel("Type DELETE to confirm").fill("DELETE"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByRole("link", { name: /sign in/i })).toBeVisible(),
      )

      const verified = yield* step(() =>
        request.post("/__fixtures/deletion/verify"),
      )

      yield* check(() => expect(verified.ok()).toBeTruthy())
    }),
)

effectTest(
  "ambiguous legacy provider work rejects deletion without mutation",
  ({ page, request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const setup = yield* step(() =>
        request.post("/__fixtures/deletion/setup", {
          data: { scenario: "sole" },
        }),
      )

      yield* check(() => expect(setup.ok()).toBeTruthy())

      const legacy = yield* step(() =>
        request.post("/__fixtures/deletion/legacy"),
      )

      yield* check(() => expect(legacy.ok()).toBeTruthy())
      yield* step(() => page.goto("/settings"))
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account", exact: true })
          .click(),
      )
      yield* step(() =>
        page.getByLabel("Type DELETE to confirm").fill("DELETE"),
      )
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(
          page.getByText(
            "Legacy provider work has no workspace owner. Resolve its ownership before deleting your account.",
          ),
        ).toBeVisible(),
      )

      const verified = yield* step(() =>
        request.post("/__fixtures/deletion/unchanged"),
      )

      yield* check(() => expect(verified.ok()).toBeTruthy())
      yield* step(() =>
        page
          .getByRole("button", { name: "Delete account and data", exact: true })
          .click(),
      )
      yield* step(() =>
        expect(page.getByRole("link", { name: /sign in/i })).toBeVisible(),
      )

      const purged = yield* step(() =>
        request.post("/__fixtures/deletion/verify"),
      )

      yield* check(() => expect(purged.ok()).toBeTruthy())
    }),
)

effectTest(
  "invite acceptance and deletion cannot create a shared-workspace data loss race",
  ({ request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const raced = yield* step(() =>
        request.post("/__fixtures/deletion/race-invite"),
      )

      yield* check(() => expect(raced.ok()).toBeTruthy())

      const result = yield* responseJson(
        raced,
        Schema.Struct({ protected: Schema.Literal(true) }),
      )

      yield* check(() => expect(result.protected).toBe(true))
    }),
)

effectTest(
  "account deletion requires authentication and same-origin requests",
  ({ request }) =>
    Effect.gen(function* () {
      const body =
        JSON.stringify(
          Schema.TaggedStruct("Request", {
            id: Schema.String,
            tag: Schema.String,
            headers: Schema.Array(Schema.Tuple([Schema.String, Schema.String])),
            payload: Schema.Struct({ confirmation: Schema.String }),
          }).make({
            id: "0",
            tag: "AccountDelete",
            headers: [],
            payload: { confirmation: "DELETE" },
          }),
        ) + "\n"

      const unauthenticated = yield* step(() =>
        request.post("/rpc", {
          data: body,
          headers: { "content-type": "application/ndjson" },
        }),
      )

      yield* check(() => expect(unauthenticated.status()).toBe(401))
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const csrf = yield* step(() =>
        request.post("/rpc", {
          data: body,
          headers: {
            "content-type": "application/ndjson",
            origin: "https://evil.example",
          },
        }),
      )

      yield* check(() => expect(csrf.status()).toBe(403))
    }),
)
