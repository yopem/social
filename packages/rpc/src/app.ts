import { RpcGroup } from "effect/rpc"

import { AccountRpc } from "rpc/contracts/accounts"
import { AnalyticsRpc } from "rpc/contracts/analytics"
import { ChannelRpc } from "rpc/contracts/channels"
import { FeedRpc } from "rpc/contracts/feeds"
import { MediaRpc } from "rpc/contracts/media"
import { PostRpc } from "rpc/contracts/posts"
import { SessionRpc } from "rpc/contracts/session"
import { WorkspaceRpc } from "rpc/contracts/workspaces"
import { Authentication } from "rpc/middleware"

export class AppRpc extends RpcGroup.make()
  .merge(
    AccountRpc,
    WorkspaceRpc,
    ChannelRpc,
    PostRpc,
    MediaRpc,
    FeedRpc,
    AnalyticsRpc,
  )
  .middleware(Authentication)
  .merge(SessionRpc) {}
