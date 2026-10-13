import { expect } from "@playwright/test"
import { Effect, Schema } from "effect"

import { check, effectTest, responseJson, step } from "./effect"

const RetentionResult = Schema.Struct({
  expiredSignIns: Schema.Number,
  activeSignIns: Schema.Number,
  expiredSessions: Schema.Number,
  activeSessions: Schema.Number,
  expiredAttempts: Schema.Number,
  activeAttempts: Schema.Number,
  expiredLocks: Schema.Number,
  staleCompleted: Schema.Number,
  recentCompleted: Schema.Number,
  pendingInbox: Schema.Number,
})

for (const mode of ["normal", "bounded", "held"] as const) {
  effectTest(`technical retention: ${mode}`, ({ page, request }) =>
    Effect.gen(function* () {
      const session = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(session.status()).toBe(200))

      const setup = yield* step(() =>
        request.post("/__fixtures/retention/setup", { data: { mode } }),
      )

      const { fixtureId } = yield* responseJson(
        setup,
        Schema.Struct({ fixtureId: Schema.String.check(Schema.isUUID()) }),
      )

      const first = yield* step(() =>
        request.post("/__fixtures/retention/cleanup", { data: { fixtureId } }),
      )

      yield* check(() => expect(first.status()).toBe(200))

      const result = yield* responseJson(first, RetentionResult)

      yield* check(() => expect(result.expiredSignIns).toBe(0))
      yield* check(() => expect(result.activeSignIns).toBe(1))
      yield* check(() => expect(result.expiredSessions).toBe(0))
      yield* check(() => expect(result.activeSessions).toBe(1))
      yield* check(() => expect(result.activeAttempts).toBe(1))
      yield* check(() => expect(result.expiredLocks).toBe(0))
      yield* check(() => expect(result.recentCompleted).toBe(1))
      yield* check(() => expect(result.pendingInbox).toBe(1))
      yield* check(() =>
        expect(result.expiredAttempts).toBe(mode === "held" ? 1 : 0),
      )
      yield* check(() =>
        expect(result.staleCompleted).toBe(mode === "bounded" ? 1 : 0),
      )

      if (mode !== "normal") {
        const next = yield* step(() =>
          request.post("/__fixtures/retention/cleanup", {
            data: { fixtureId, release: mode === "held" },
          }),
        )

        const after = yield* responseJson(next, RetentionResult)

        yield* check(() => expect(after.expiredAttempts).toBe(0))
        yield* check(() => expect(after.staleCompleted).toBe(0))
        yield* check(() => expect(after.pendingInbox).toBe(1))
      }

      yield* step(() => page.goto("/"))
      yield* step(() =>
        expect(
          page.getByRole("link", { name: "Settings", exact: true }),
        ).toBeVisible(),
      )
    }),
  )
}
