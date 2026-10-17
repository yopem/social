import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { Platform } from "rpc/contracts/channels"
import { WorkspaceInput } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"
import { Id, Name } from "rpc/lib/schema"

export const Metric = Schema.Struct({
  name: Name,
  value: Schema.Number,
  unit: Schema.Literals(["count", "percentage", "milliseconds", "seconds"]),
})

export type Metric = typeof Metric.Type

export const ChannelMetrics = Schema.Struct({
  channelId: Id,
  platform: Platform,
  available: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
  metrics: Schema.Array(Metric),
})

export const PostMetrics = Schema.Struct({
  postId: Id,
  channelId: Id,
  available: Schema.Boolean,
  reason: Schema.NullOr(Schema.String),
  metrics: Schema.Array(Metric),
})

export const Analytics = Schema.Struct({
  channels: Schema.Array(ChannelMetrics),
  posts: Schema.Array(PostMetrics),
})

export type Analytics = typeof Analytics.Type

export class AnalyticsRpc extends RpcGroup.make(
  Rpc.make("AnalyticsRead", {
    payload: WorkspaceInput,
    success: Analytics,
    error: ApiError,
  }),
) {}
