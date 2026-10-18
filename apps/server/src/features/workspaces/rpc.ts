import { Effect } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"

import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import { WorkspaceRpc } from "rpc/contracts/workspaces"
import { Authentication, CurrentUser } from "rpc/middleware"

export function workspaceRpcHandlers(config: AppConfig) {
  return WorkspaceRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const workspacesDb = yield* WorkspacesDb
      const gate = yield* OperationGate

      function guarded<A, E, R>(operation: Effect.Effect<A, E, R>) {
        return Effect.flatMap(CurrentUser, (user) =>
          gate.run(user.id, null, operation),
        )
      }

      return {
        WorkspaceCreate: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            workspacesDb.createWorkspace({
              userId: user.id,
              name: input.name,
              kind: input.kind,
              timezone: input.timezone,
            }),
          ).pipe(guarded),
        WorkspaceMembers: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            workspacesDb.members({
              userId: user.id,
              workspaceId: input.workspaceId,
            }),
          ),
        WorkspaceInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            workspacesDb.invite({
              userId: user.id,
              workspaceId: input.workspaceId,
              email: input.email,
              role: input.role,
            }),
          ).pipe(
            guarded,
            Effect.map(({ token }) => ({
              url: `${config.APP_ORIGIN}/invite?token=${encodeURIComponent(token)}`,
            })),
          ),
        WorkspaceAcceptInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            workspacesDb.acceptInvite({ user, token: input.token }),
          ).pipe(guarded),
        WorkspaceTransfer: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            gate.run(
              user.id,
              input.workspaceId,
              workspacesDb.transferOwnership({
                userId: user.id,
                workspaceId: input.workspaceId,
                memberId: input.memberId,
              }),
            ),
          ),
        WorkspaceRemoveMember: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            workspacesDb.removeMember({
              userId: user.id,
              workspaceId: input.workspaceId,
              memberId: input.userId,
            }),
          ).pipe(guarded),
      }
    }),
  )
}
