import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"

import { check, effectTest, responseJson, step } from "./effect"

const Reconciliation = Schema.Struct({
  postId: Schema.String,
  dispatches: Schema.Number,
  state: Schema.String,
  deliveryState: Schema.String,
  acknowledgements: Schema.Number,
  retries: Schema.Number,
})

effectTest(
  "provider lookup outage retries queue and preserves uncertain post",
  ({ request }) =>
    Effect.gen(function* () {
      const signed = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(signed.ok()).toBeTruthy())

      const setup = yield* step(() =>
        request.post("/__fixtures/reconciliation", { data: { mode: "setup" } }),
      )

      yield* check(() => expect(setup.ok()).toBeTruthy())
      const pending = yield* responseJson(setup, Reconciliation)
      yield* check(() =>
        expect(pending).toMatchObject({
          dispatches: 1,
          state: "pending",
          deliveryState: "unknown",
          acknowledgements: 0,
          retries: 0,
        }),
      )

      const failed = yield* step(() =>
        request.post("/__fixtures/reconciliation", {
          data: { mode: "fail", postId: pending.postId },
        }),
      )

      yield* check(() => expect(failed.ok()).toBeTruthy())
      const uncertain = yield* responseJson(failed, Reconciliation)
      yield* check(() =>
        expect(uncertain).toMatchObject({
          postId: pending.postId,
          dispatches: 1,
          state: "pending",
          deliveryState: "unknown",
          acknowledgements: 0,
          retries: 1,
        }),
      )

      const restored = yield* step(() =>
        request.post("/__fixtures/reconciliation", {
          data: { mode: "restore", postId: pending.postId },
        }),
      )

      yield* check(() => expect(restored.ok()).toBeTruthy())
      const published = yield* responseJson(restored, Reconciliation)
      yield* check(() =>
        expect(published).toMatchObject({
          postId: pending.postId,
          dispatches: 1,
          state: "published",
          deliveryState: "published",
          acknowledgements: 1,
          retries: 0,
        }),
      )
    }),
)
