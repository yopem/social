import type { QueryClient } from "@tanstack/react-query"

import { Match } from "effect"

import type { Platform } from "rpc/contracts/channels"

import { rpcMutation, workspaceQuery } from "@/lib/queries"

export function channelsQuery(workspaceId: string) {
  return workspaceQuery(workspaceId, "channels", (client) =>
    client.ChannelList({ workspaceId }),
  )
}

export function connectionBeginMutation({
  client,
  workspaceId,
  loginHint,
}: {
  client: QueryClient
  workspaceId: string
  loginHint: string
}) {
  return rpcMutation(client, workspaceId, (rpc, platform: Platform) =>
    rpc.ConnectionBegin({
      workspaceId,
      platform,
      loginHint: Match.value(platform).pipe(
        Match.when("bluesky", () => loginHint || undefined),
        Match.orElse(() => undefined),
      ),
    }),
  )
}

export function channelDisconnectMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(client, workspaceId, (rpc, channelId: string) =>
    rpc.ChannelDisconnect({ workspaceId, channelId }),
  )
}

export function connectionAccountsQuery({
  workspaceId,
  attemptId,
}: {
  workspaceId: string
  attemptId: string
}) {
  return workspaceQuery(
    workspaceId,
    "accounts",
    (client) => client.ConnectionAccounts({ workspaceId, attemptId }),
    attemptId,
  )
}

export function connectionSelectMutation({
  client,
  workspaceId,
  attemptId,
}: {
  client: QueryClient
  workspaceId: string
  attemptId: string
}) {
  return rpcMutation(
    client,
    workspaceId,
    (rpc, accountIds: readonly string[]) =>
      rpc.ConnectionSelect({ workspaceId, attemptId, accountIds }),
  )
}
