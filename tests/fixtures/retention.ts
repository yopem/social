import { Effect, Schema } from "effect"

import { CredentialCrypto } from "auth/services/crypto"
import { CoreDb } from "db/services/core"
import { RetentionDb } from "db/services/retention"
import {
  releaseRetentionFixture,
  retentionFixtureCounts,
  seedRetentionFixture,
} from "db/services/retention-fixture"
import { WorkerResources } from "env/server"

import { fixtureError, fixtureJson } from "./auth"

export function retentionFixtureSetup(
  request: Request,
  userId: string,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const { mode } = yield* fixtureJson(
      request,
      Schema.Struct({ mode: Schema.Literals(["normal", "bounded", "held"]) }),
    )

    const core = yield* CoreDb
    yield* core.workspaceAccess(userId, workspaceId)
    const resources = yield* WorkerResources
    const cipher = yield* CredentialCrypto
    const fixtureId = crypto.randomUUID()

    const ciphertext = yield* cipher.encrypt(
      JSON.stringify({ fixtureId, technical: "retention" }),
    )

    const accessHash = yield* cipher.hash(`${fixtureId}:expired-access`)
    const refreshHash = yield* cipher.hash(`${fixtureId}:expired-refresh`)
    const activeAccessHash = yield* cipher.hash(`${fixtureId}:active-access`)
    const activeRefreshHash = yield* cipher.hash(`${fixtureId}:active-refresh`)

    return Response.json(
      yield* seedRetentionFixture(resources.DB, {
        fixtureId,
        userId,
        workspaceId,
        mode,
        ciphertext,
        accessHash,
        refreshHash,
        activeAccessHash,
        activeRefreshHash,
      }),
    )
  })
}

export function retentionFixtureCleanup(
  request: Request,
  userId: string,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const { fixtureId, release } = yield* fixtureJson(
      request,
      Schema.Struct({
        fixtureId: Schema.String.check(Schema.isUUID()),
        release: Schema.optional(Schema.Boolean),
      }),
    )

    const core = yield* CoreDb
    yield* core.workspaceAccess(userId, workspaceId)
    const resources = yield* WorkerResources
    const input = { fixtureId, userId, workspaceId }
    const before = yield* retentionFixtureCounts(resources.DB, input)

    if (before.activeAttempts !== 1 || before.activeSessions !== 1)
      return yield* fixtureError("Retention fixture access denied")

    if (release) yield* releaseRetentionFixture(resources.DB, input)
    const retention = yield* RetentionDb
    yield* retention.cleanup()

    return Response.json(yield* retentionFixtureCounts(resources.DB, input))
  })
}
