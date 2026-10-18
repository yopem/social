import { Effect } from "effect"

import { WorkspacesDb } from "db/services/workspaces"
import { SessionRpc } from "rpc/contracts/session"
import { RequestIdentity } from "rpc/middleware"

export function sessionRpcHandlers() {
  return SessionRpc.toLayer(
    Effect.gen(function* () {
      const workspacesDb = yield* WorkspacesDb

      return {
        SessionRead: () =>
          Effect.gen(function* () {
            const user = yield* RequestIdentity

            return {
              user,
              workspaces: user
                ? yield* workspacesDb.listWorkspaces(user.id)
                : [],
            }
          }),
      }
    }),
  )
}
