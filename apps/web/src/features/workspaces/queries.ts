import { mutationOptions, type QueryClient } from "@tanstack/react-query"
import { Effect } from "effect"

import type { WorkspaceCreateInput as WorkspaceForm } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"

import type { InviteForm } from "@/features/workspaces/schema"

import {
  effectMutation,
  execute,
  rpcMutation,
  workspaceQuery,
} from "@/lib/queries"

export function createWorkspaceMutation(client: QueryClient) {
  return rpcMutation(client, "", (rpc, input: typeof WorkspaceForm.Type) =>
    rpc.WorkspaceCreate(input),
  )
}

export function workspaceMembersQuery(workspaceId: string) {
  return workspaceQuery(workspaceId, "members", (rpc) =>
    rpc.WorkspaceMembers({ workspaceId }),
  )
}

export function removeMemberMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(client, workspaceId, (rpc, userId: string) =>
    rpc.WorkspaceRemoveMember({ workspaceId, userId }),
  )
}

export function transferOwnershipMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return mutationOptions({
    ...rpcMutation(client, workspaceId, (rpc, memberId: string) =>
      rpc.WorkspaceTransfer({ workspaceId, memberId }),
    ),
    onSuccess: () =>
      execute(
        Effect.all(
          [
            Effect.promise(() =>
              client.invalidateQueries({
                queryKey: ["workspace", workspaceId],
              }),
            ),
            Effect.promise(() =>
              client.invalidateQueries({ queryKey: ["session"] }),
            ),
          ],
          { concurrency: 2 },
        ),
      ),
  })
}

export function inviteMemberMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(
    client,
    workspaceId,
    (rpc, input: typeof InviteForm.Type) =>
      rpc.WorkspaceInvite({ workspaceId, ...input }),
  )
}

export function copyInvitationMutation() {
  return effectMutation((url: string) =>
    Effect.tryPromise({
      try: () => navigator.clipboard.writeText(url),
      catch: () =>
        new ApiError({
          code: "upstream-failure",
          message:
            "Could not copy. Select the invite link and copy it manually.",
        }),
    }),
  )
}
