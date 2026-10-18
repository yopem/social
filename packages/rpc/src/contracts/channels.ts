import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { WorkspaceInput } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"
import { JsonObject } from "rpc/lib/json"
import { Id, Name } from "rpc/lib/schema"

export const Platform = Schema.Literals([
  "x",
  "threads",
  "bluesky",
  "youtube",
  "tiktok",
  "instagram",
  "linkedin",
  "facebook",
])

export type Platform = typeof Platform.Type

export const Channel = Schema.Struct({
  id: Id,
  workspaceId: Id,
  platform: Platform,
  backend: Id,
  accountId: Id,
  displayName: Name,
  status: Schema.Literals(["connected", "reconnect-required", "disconnected"]),
})

export type Channel = typeof Channel.Type

export const PlatformAvailability = Schema.Struct({
  platform: Platform,
  configured: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
})

export const ChannelOverview = Schema.Struct({
  channels: Schema.Array(Channel),
  platforms: Schema.Array(PlatformAvailability),
})

export const DiscoveredAccount = Schema.Struct({
  accountId: Id,
  platform: Platform,
  displayName: Name,
})

export type DiscoveredAccount = typeof DiscoveredAccount.Type

export const ChannelInput = Schema.Struct({ workspaceId: Id, channelId: Id })

export class ChannelRpc extends RpcGroup.make(
  Rpc.make("ChannelList", {
    payload: WorkspaceInput,
    success: ChannelOverview,
    error: ApiError,
  }),
  Rpc.make("ConnectionBegin", {
    payload: {
      workspaceId: Id,
      platform: Platform,
      loginHint: Schema.optional(Schema.String),
    },
    success: Schema.Struct({ attemptId: Id, url: Schema.String }),
    error: ApiError,
  }),
  Rpc.make("ConnectionAccounts", {
    payload: { workspaceId: Id, attemptId: Id },
    success: Schema.Array(DiscoveredAccount),
    error: ApiError,
  }),
  Rpc.make("ConnectionSelect", {
    payload: {
      workspaceId: Id,
      attemptId: Id,
      accountIds: Schema.Array(Id).pipe(Schema.check(Schema.isMinLength(1))),
    },
    success: Schema.Array(Channel),
    error: ApiError,
  }),
  Rpc.make("TikTokCreatorInfo", {
    payload: ChannelInput,
    success: JsonObject,
    error: ApiError,
  }),
  Rpc.make("ChannelDisconnect", {
    payload: ChannelInput,
    success: Schema.Void,
    error: ApiError,
  }),
) {}
