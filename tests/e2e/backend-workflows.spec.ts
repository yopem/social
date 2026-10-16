import type { RpcMessage } from "effect/rpc"

import { expect } from "@playwright/test"
import { Data, Effect, Schema } from "effect"
import { RpcSerialization } from "effect/rpc"

import { check, E2EFailure, effectTest, responseJson, step } from "./effect"

const scenarios = {
  pagination: [
    "olderScheduledVisible",
    "channelScoped",
    "halfOpenRange",
    "stablePages",
    "draftPageSizes",
    "draftCursorOrder",
    "draftWorkspaceScoped",
    "deliveryCapAndOrder",
    "deliveryIsolation",
    "invalidRangeRejected",
    "invalidLimitRejected",
    "workspaceDenied",
    "calendarWorkspaceScoped",
    "calendarChannelScoped",
    "calendarRangeScoped",
    "calendarUniquePages",
  ],
  media: [
    "inputOrder",
    "privateUrls",
    "emptyList",
    "duplicatesPreserved",
    "tooManyRejected",
    "unknownDenied",
    "crossWorkspaceDenied",
    "workspaceDenied",
  ],
  publication: [
    "changedContentRejected",
    "changedScheduleRejected",
    "unchangedClaimed",
    "sameKeyIdempotent",
    "differentKeyRejected",
    "cancelledRejected",
    "needsReviewRejected",
    "queuedSnapshotRejected",
    "uncertainLockRetained",
    "publicationWriteCount",
    "terminalRepeatWithoutPreparation",
    "activeRepeatWithoutPreparation",
    "differentKeyWithoutPreparation",
  ],
  retention: [
    "expiredCredentialRemoved",
    "expiredLockRemoved",
    "activeCredentialRetained",
    "heldCredentialRetained",
    "heldAccountLockRetained",
    "heldWorkspaceCredentialRetained",
    "heldWorkspaceLockRetained",
  ],
  snapshots: [
    "snapshotRemoved",
    "otherWorkspaceRetained",
    "ownScheduledDeliveryBlocksDeletion",
  ],
  rss: [
    "deletedDraftSkipped",
    "laterEntryImported",
    "noResurrection",
    "enclosureNotRequested",
  ],
  recovery: [
    "expiredEnqueuedRecovered",
    "sameOperationKey",
    "legacyEnqueuedRecovered",
    "freshEnqueuedRetained",
    "dispatchingRetained",
  ],
  timezone: ["invalidRejected", "validAccepted"],
} as const

for (const [scenario, assertions] of Object.entries(scenarios)) {
  effectTest(`backend workflows: ${scenario}`, ({ request }) =>
    Effect.gen(function* () {
      const session = yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      yield* check(() => expect(session.status()).toBe(200))

      const response = yield* step(() =>
        request.post(`/__fixtures/backend-workflows/${scenario}`),
      )

      const diagnostic = yield* step(() => response.text())
      yield* check(() => expect(response.status(), diagnostic).toBe(200))

      const report = yield* responseJson(
        response,
        Schema.Struct({ checks: Schema.Record(Schema.String, Schema.Boolean) }),
      )

      for (const assertion of assertions)
        yield* check(() =>
          expect(report.checks[assertion], `${assertion}: ${diagnostic}`).toBe(
            true,
          ),
        )
    }),
  )
}

effectTest(
  "MediaList rejects malformed RPC input and missing session",
  ({ page, request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      const setup = yield* step(() =>
        request.post("/__fixtures/backend-workflows/setup"),
      )

      const seeded = yield* responseJson(
        setup,
        Schema.Struct({ workspaceId: Schema.String }),
      )

      const message = Data.taggedEnum<RpcMessage.RequestEncoded>().Request({
        id: "media-limit",
        tag: "MediaList",
        headers: [],
        payload: {
          workspaceId: seeded.workspaceId,
          mediaIds: Array.from({ length: 21 }, () => "fixture-media"),
        },
      })

      const body = yield* Schema.decodeUnknownEffect(Schema.String)(
        RpcSerialization.ndjson.makeUnsafe().encode(message),
      ).pipe(
        Effect.mapError(
          () => new E2EFailure({ message: "RPC request encoding failed" }),
        ),
      )

      const invalid = yield* step(() =>
        request.post("/rpc", {
          data: body,
          headers: { "content-type": "application/ndjson" },
        }),
      )

      const result = yield* step(() => invalid.text())
      yield* check(() => expect(result).toContain('"Failure"'))
      yield* check(() => expect(result).not.toContain('"Success"'))
      yield* check(() => expect(result).toContain("mediaIds"))
      yield* check(() => expect(result).toContain("at most 20"))
      yield* step(() => page.context().clearCookies())

      const denied = yield* step(() =>
        request.post("/rpc", {
          data: body,
          headers: { "content-type": "application/ndjson" },
        }),
      )

      yield* check(() => expect(denied.status()).toBe(401))
    }),
)

effectTest(
  "backend calendar setup rejects noncanonical timestamps",
  ({ request }) =>
    Effect.gen(function* () {
      yield* step(() =>
        request.post("/__fixtures/session", { data: { identity: "owner" } }),
      )

      for (const field of ["scheduledAt", "boundaryAt"]) {
        const response = yield* step(() =>
          request.post("/__fixtures/backend-workflows/setup", {
            data: { [field]: "2027-09-05T01:00:00-03:00" },
          }),
        )

        yield* check(() => expect(response.status()).toBe(400))
      }
    }),
)
