import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { WorkspaceInput } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"
import { Id, Name } from "rpc/lib/schema"

export const FeedMode = Schema.Literals(["draft", "automatic"])

export const Feed = Schema.Struct({
  id: Id,
  workspaceId: Id,
  url: Schema.String,
  name: Name,
  mode: FeedMode,
  channelIds: Schema.Array(Id),
  includeImages: Schema.Boolean,
  includeVideos: Schema.Boolean,
  enabled: Schema.Boolean,
  lastCheckedAt: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
})

export type Feed = typeof Feed.Type

export const FeedInput = Schema.Struct({ workspaceId: Id, feedId: Id })

export class FeedRpc extends RpcGroup.make(
  Rpc.make("FeedList", {
    payload: WorkspaceInput,
    success: Schema.Array(Feed),
    error: ApiError,
  }),
  Rpc.make("FeedSave", {
    payload: {
      workspaceId: Id,
      feedId: Schema.optional(Id),
      url: Schema.String,
      name: Name,
      mode: FeedMode,
      channelIds: Schema.Array(Id),
      includeImages: Schema.Boolean,
      includeVideos: Schema.Boolean,
      enabled: Schema.Boolean,
    },
    success: Feed,
    error: ApiError,
  }),
  Rpc.make("FeedRefresh", {
    payload: FeedInput,
    success: Schema.Struct({ imported: Schema.Number }),
    error: ApiError,
  }),
  Rpc.make("FeedDelete", {
    payload: FeedInput,
    success: Schema.Void,
    error: ApiError,
  }),
) {}
