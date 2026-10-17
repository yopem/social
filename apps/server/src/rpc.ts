import { Layer } from "effect"
import { accountRpcHandlers } from "server/features/accounts/rpc"
import { analyticsRpcHandlers } from "server/features/analytics/rpc"
import { channelRpcHandlers } from "server/features/channels/rpc"
import { feedRpcHandlers } from "server/features/feeds/rpc"
import { mediaRpcHandlers } from "server/features/media/rpc"
import { postRpcHandlers } from "server/features/posts/rpc"
import { sessionRpcHandlers } from "server/features/session/rpc"
import { workspaceRpcHandlers } from "server/features/workspaces/rpc"

import type { AppConfig } from "env/server"

export function rpcHandlers(config: AppConfig) {
  return Layer.mergeAll(
    accountRpcHandlers(),
    sessionRpcHandlers(),
    workspaceRpcHandlers(config),
    channelRpcHandlers(),
    postRpcHandlers(),
    mediaRpcHandlers(),
    feedRpcHandlers(),
    analyticsRpcHandlers(),
  )
}
