import { Effect } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"

import { CoreDb } from "db/services/client"
import type { AppConfig } from "env/server"
import { WorkspaceRpc } from "rpc/contracts/workspaces"
import { Authentication, CurrentUser } from "rpc/middleware"

export function workspaceRpcHandlers(config: AppConfig) {
  return WorkspaceRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const db = yield* CoreDb
      const gate = yield* OperationGate

      function guarded<A, E, R>(operation: Effect.Effect<A, E, R>) {
        return Effect.flatMap(CurrentUser, (user) =>
          gate.run(user.id, null, operation),
        )
      }

      return {
        WorkspaceCreate: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.createWorkspace(user.id, input.name, input.kind, input.timezone),
          ).pipe(guarded),
        WorkspaceMembers: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.members(user.id, input.workspaceId),
          ),
        WorkspaceInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.invite(user.id, input.workspaceId, input.email, input.role),
          ).pipe(
            guarded,
            Effect.map(({ token }) => ({
              url: `${config.APP_ORIGIN}/invite?token=${encodeURIComponent(token)}`,
            })),
          ),
        WorkspaceAcceptInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.acceptInvite(user, input.token),
          ).pipe(guarded),
        WorkspaceTransfer: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            gate.run(
              user.id,
              input.workspaceId,
              db.transferOwnership(user.id, input.workspaceId, input.memberId),
            ),
          ),
        WorkspaceRemoveMember: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.removeMember(user.id, input.workspaceId, input.userId),
          ).pipe(guarded),
      }
    }),
  )
}
