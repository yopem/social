import { expect } from "@playwright/test"
import { Effect, Match, Schema } from "effect"
import { Buffer } from "node:buffer"
import { request as httpRequest, type OutgoingHttpHeaders } from "node:http"

import { Media, Session } from "rpc/contracts/models"

import { check, effectTest, responseJson, step, E2EFailure } from "./effect"

const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z1WQAAAAASUVORK5CYII=",
  "base64",
)

effectTest("R2 media persists and requires workspace access", ({ request }) =>
  Effect.gen(function* () {
    const signedIn = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    yield* check(() => expect(signedIn.ok()).toBeTruthy())
    const session = yield* responseJson(signedIn, Session)
    const workspace = session.workspaces[0]
    yield* check(() => expect(workspace).toBeDefined())

    if (!workspace) return

    const uploaded = yield* step(() =>
      request.post(
        `/media/upload?workspace=${encodeURIComponent(workspace.id)}`,
        {
          data: image,
          headers: {
            "content-type": "image/png",
            "x-file-name": "fixture.png",
          },
        },
      ),
    )

    yield* check(() => expect(uploaded.ok()).toBeTruthy())
    const media = yield* responseJson(uploaded, Media)
    const stored = yield* step(() => request.get(media.url))
    yield* check(() => expect(stored.status()).toBe(200))
    const bytes = yield* step(() => stored.body())
    yield* check(() => expect(bytes.equals(image)).toBe(true))

    const other = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "outsider" } }),
    )

    yield* check(() => expect(other.ok()).toBeTruthy())
    const forbidden = yield* step(() => request.get(media.url))
    yield* check(() => expect(forbidden.status()).toBe(404))
  }),
)

effectTest(
  "media rejects incorrect magic bytes and unsupported media types",
  ({ request }) =>
    Effect.gen(function* () {
      const signedIn = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const session = yield* responseJson(signedIn, Session)
      const workspace = session.workspaces[0]
      yield* check(() => expect(workspace).toBeDefined())

      if (!workspace) return

      const wrongBytes = yield* step(() =>
        request.post(
          `/media/upload?workspace=${encodeURIComponent(workspace.id)}`,
          {
            data: "This is not a PNG.",
            headers: { "content-type": "image/png", "x-file-name": "bad.png" },
          },
        ),
      )

      yield* check(() => expect(wrongBytes.status()).toBe(400))

      const unsupported = yield* step(() =>
        request.post(
          `/media/upload?workspace=${encodeURIComponent(workspace.id)}`,
          {
            data: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
            headers: {
              "content-type": "image/svg+xml",
              "x-file-name": "unsafe.svg",
            },
          },
        ),
      )

      yield* check(() => expect(unsupported.status()).toBe(400))

      const result = yield* responseJson(
        unsupported,
        Schema.Struct({ error: Schema.String }),
      )

      yield* check(() => expect(result.error.length).toBeGreaterThan(0))
    }),
)

for (const scenario of [
  "small",
  "exact-part",
  "chunked",
  "declared-limit",
  "actual-limit",
] as const) {
  effectTest(`media streaming: ${scenario}`, ({ request }) =>
    Effect.gen(function* () {
      const signedIn = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const session = yield* responseJson(signedIn, Session)
      const workspace = session.workspaces[0]
      yield* check(() => expect(workspace).toBeDefined())

      if (!workspace) return
      const state = yield* step(() => request.storageState())

      const succeeds = !["declared-limit", "actual-limit"].includes(scenario)

      const bytes = Buffer.alloc(
        Match.value(scenario).pipe(
          Match.when("small", () => image.length),
          Match.when("exact-part", () => 5242880),
          Match.when("chunked", () => 5242880 + 37),
          Match.orElse(() => 10000001),
        ),
      )

      image.copy(bytes)

      const result = yield* step(
        () =>
          new Promise<{ status: number; body: string }>((resolve, reject) => {
            const headers: OutgoingHttpHeaders = {
              cookie: state.cookies
                .map((cookie) => `${cookie.name}=${cookie.value}`)
                .join("; "),
              origin: "http://localhost:3200",
              "content-type": "image/png",
              "x-file-name": "streamed.png",
            }

            if (scenario === "declared-limit")
              headers["content-length"] = bytes.length

            const upload = httpRequest(
              `http://localhost:3200/media/upload?workspace=${encodeURIComponent(workspace.id)}`,
              {
                method: "POST",
                headers,
              },
              (response) => {
                const chunks: Buffer[] = []
                response.on("data", (chunk: Buffer) => chunks.push(chunk))
                response.on("error", reject)
                response.on("end", () =>
                  resolve({
                    status: response.statusCode ?? 0,
                    body: Buffer.concat(chunks).toString(),
                  }),
                )
              },
            )

            upload.on("error", reject)
            upload.write(bytes.subarray(0, 7))
            upload.write(bytes.subarray(7, 16))
            upload.end(bytes.subarray(16))
          }),
      )

      yield* check(() => expect(result.status).toBe(succeeds ? 200 : 400))

      if (!succeeds) return

      const media = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Media),
      )(result.body).pipe(
        Effect.mapError(
          () => new E2EFailure({ message: "Invalid uploaded media response." }),
        ),
      )

      yield* check(() => expect(media.bytes).toBe(bytes.length))
      const stored = yield* step(() => request.get(media.url))
      yield* check(() => expect(stored.status()).toBe(200))
      const downloaded = yield* step(() => stored.body())
      yield* check(() => expect(downloaded.equals(bytes)).toBe(true))
    }),
  )
}

for (const fault of [
  "part",
  "complete",
  "save",
  "complete-interrupt",
  "put-interrupt",
  "producer",
  "linked-interrupt",
] as const) {
  effectTest(`media cleanup: ${fault}`, ({ request }) =>
    Effect.gen(function* () {
      const signedIn = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(signedIn.ok()).toBeTruthy())

      const response = yield* step(() =>
        request.post("/__fixtures/media/lifetime", { data: { fault } }),
      )

      yield* check(() => expect(response.ok()).toBeTruthy())

      const result = yield* responseJson(
        response,
        Schema.Struct({
          failed: Schema.Boolean,
          aborted: Schema.Boolean,
          objectPresent: Schema.Boolean,
          linked: Schema.Boolean,
          committed: Schema.Boolean,
          deleted: Schema.Boolean,
          error: Schema.NullOr(
            Schema.Struct({ code: Schema.String, message: Schema.String }),
          ),
        }),
      )

      yield* check(() => {
        expect(result.failed).toBe(true)
        expect(result.linked).toBe(fault === "linked-interrupt")
        expect(result.objectPresent).toBe(fault === "linked-interrupt")
        expect(result.aborted).toBe(["part", "complete"].includes(fault))
        expect(result.committed).toBe(
          [
            "save",
            "complete-interrupt",
            "put-interrupt",
            "linked-interrupt",
          ].includes(fault),
        )
        expect(result.deleted).toBe(fault !== "linked-interrupt")

        if (fault === "producer") {
          expect(result.error?.code).toBe("invalid-input")
          expect(result.error?.message).toBe("The upload could not be read.")
        }
      })
    }),
  )
}

effectTest("remote image import persists enclosure bytes", ({ request }) =>
  Effect.gen(function* () {
    const signedIn = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )

    yield* check(() => expect(signedIn.ok()).toBeTruthy())
    const imported = yield* step(() => request.post("/__fixtures/media/remote"))
    yield* check(() => expect(imported.ok()).toBeTruthy())
    const media = yield* responseJson(imported, Media)
    const stored = yield* step(() => request.get(media.url))
    yield* check(() => expect(stored.status()).toBe(200))
    const bytes = yield* step(() => stored.body())
    yield* check(() => expect(bytes.equals(image)).toBe(true))
  }),
)
