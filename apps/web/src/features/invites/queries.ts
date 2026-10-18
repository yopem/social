import { mutationOptions, type QueryClient } from "@tanstack/react-query"
import { Effect } from "effect"

import { callRpc } from "rpc/client"
import type { Workspace } from "rpc/contracts/workspaces"

import { execute } from "@/lib/queries"

export function acceptInvitationMutation({
  client,
  token,
  onAccepted,
}: {
  client: QueryClient
  token: string
  onAccepted: (workspace: Workspace) => Promise<void>
}) {
  return mutationOptions({
    mutationFn: () =>
      execute(callRpc((rpc) => rpc.WorkspaceAcceptInvite({ token }))),
    // The server consumes an accepted token. Do not retry a lost response.
    retry: false,
    onSuccess: (workspace) =>
      execute(
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            client.invalidateQueries({ queryKey: ["session"] }),
          )
          yield* Effect.promise(() => onAccepted(workspace))
        }),
      ),
  })
}
