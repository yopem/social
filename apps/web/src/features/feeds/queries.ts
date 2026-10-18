import type { QueryClient } from "@tanstack/react-query"

import type { FeedForm } from "@/features/feeds/schema"

import { rpcMutation, workspaceQuery } from "@/lib/queries"

export function feedsQuery(workspaceId: string) {
  return workspaceQuery(workspaceId, "feeds", (rpc) =>
    rpc.FeedList({ workspaceId }),
  )
}

export function refreshFeedMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(client, workspaceId, (rpc, feedId: string) =>
    rpc.FeedRefresh({ workspaceId, feedId }),
  )
}

export function deleteFeedMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(client, workspaceId, (rpc, feedId: string) =>
    rpc.FeedDelete({ workspaceId, feedId }),
  )
}

export function saveFeedMutation({
  client,
  workspaceId,
  feedId,
}: {
  client: QueryClient
  workspaceId: string
  feedId?: string
}) {
  return rpcMutation(client, workspaceId, (rpc, value: typeof FeedForm.Type) =>
    rpc.FeedSave({ workspaceId, feedId, ...value }),
  )
}
