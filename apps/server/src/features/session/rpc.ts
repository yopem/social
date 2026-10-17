import { Effect } from "effect"

import { CoreDb } from "db/services/client"
import { SessionRpc } from "rpc/contracts/session"
import { RequestIdentity } from "rpc/middleware"

export function sessionRpcHandlers() {
  return SessionRpc.toLayer(
    Effect.gen(function* () {
      const db = yield* CoreDb

      return {
        SessionRead: () =>
          Effect.gen(function* () {
            const user = yield* RequestIdentity

            return {
              user,
              workspaces: user ? yield* db.listWorkspaces(user.id) : [],
            }
          }),
      }
    }),
  )
}
