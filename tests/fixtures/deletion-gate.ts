import { Effect, Schema } from "effect"

import { CredentialCrypto } from "auth/services/crypto"
import { DeletionDb } from "db/services/accounts/deletion"
import { recoverAccountOperations } from "db/services/deletion/operation-recovery"
import { WorkerResources } from "env/server"

import { fixtureCookie, fixtureError, fixtureJson } from "./auth"

const HeldOperation = Schema.Struct({
  userId: Schema.String,
  token: Schema.String,
})

export function deletionGateFixture(
  request: Request,
  userId: string,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const db = yield* DeletionDb
    const cipher = yield* CredentialCrypto
    const path = new URL(request.url).pathname

    if (path.endsWith("/status"))
      return Response.json({ operations: yield* db.activeOperations(userId) })

    if (path.endsWith("/hold")) {
      const token = yield* db.acquireOperation(userId, workspaceId)
      const ticket = yield* cipher.encrypt(JSON.stringify({ userId, token }))

      return Response.json(
        { held: true },
        {
          headers: {
            "set-cookie": `fixture_operation=${ticket}; Path=/; HttpOnly; SameSite=Lax`,
          },
        },
      )
    }

    const ticket = fixtureCookie(request, "fixture_operation")

    if (!ticket)
      return yield* Effect.fail(fixtureError("Held operation ticket missing"))

    const operation = yield* cipher.decrypt(ticket).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.fromJsonString(HeldOperation)),
      ),
      Effect.mapError(() => fixtureError("Held operation ticket invalid")),
    )

    if (operation.userId !== userId)
      return yield* Effect.fail(fixtureError("Held operation owner mismatch"))

    if (path.endsWith("/recover")) {
      const { confirmation } = yield* fixtureJson(
        request,
        Schema.Struct({ confirmation: Schema.String }),
      )

      if (confirmation !== "WORKER_AND_JOBS_STOPPED")
        return yield* Effect.fail(
          fixtureError("Confirm that the Worker and jobs have stopped."),
        )
      const resources = yield* WorkerResources

      return Response.json(
        yield* recoverAccountOperations(resources.DB, {
          userId,
          tokens: [operation.token],
          confirmation,
        }),
      )
    }

    yield* db.releaseOperation(operation.token)

    return Response.json({ released: true })
  })
}
