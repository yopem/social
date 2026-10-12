import { Buffer } from "node:buffer"

import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"

import { Media, Session } from "rpc/contracts/models"

import { check, effectTest, responseJson, step } from "./effect"

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
      request.post(`/media/upload?workspace=${encodeURIComponent(workspace.id)}`, {
        data: image,
        headers: { "content-type": "image/png", "x-file-name": "fixture.png" },
      }),
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

effectTest("media rejects incorrect magic bytes and unsupported media types", ({
  request,
}) =>
  Effect.gen(function* () {
    const signedIn = yield* step(() =>
      request.post("/__fixtures/session", { data: { identity: "owner" } }),
    )
    const session = yield* responseJson(signedIn, Session)
    const workspace = session.workspaces[0]
    yield* check(() => expect(workspace).toBeDefined())
    if (!workspace) return
    const wrongBytes = yield* step(() =>
      request.post(`/media/upload?workspace=${encodeURIComponent(workspace.id)}`, {
        data: "This is not a PNG.",
        headers: { "content-type": "image/png", "x-file-name": "bad.png" },
      }),
    )
    yield* check(() => expect(wrongBytes.status()).toBe(400))
    const unsupported = yield* step(() =>
      request.post(`/media/upload?workspace=${encodeURIComponent(workspace.id)}`, {
        data: "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
        headers: { "content-type": "image/svg+xml", "x-file-name": "unsafe.svg" },
      }),
    )
    yield* check(() => expect(unsupported.status()).toBe(400))
    const result = yield* responseJson(
      unsupported,
      Schema.Struct({ error: Schema.String }),
    )
    yield* check(() => expect(result.error.length).toBeGreaterThan(0))
  }),
)
