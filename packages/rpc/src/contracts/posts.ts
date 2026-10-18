import { DateTime, Option, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { Platform } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"
import { JsonObject } from "rpc/lib/json"
import { Id } from "rpc/lib/schema"

export const PlatformOverride = Schema.Struct({
  channelId: Id,
  text: Schema.optional(Schema.String.check(Schema.isMaxLength(100_000))),
  title: Schema.optional(Schema.String.check(Schema.isMaxLength(500))),
  visibility: Schema.optional(
    Schema.Literals(["public", "private", "unlisted"]),
  ),
  madeForKids: Schema.optional(Schema.Boolean),
  privacyLevel: Schema.optional(Schema.String),
  creatorConsent: Schema.optional(Schema.Boolean),
  disableComment: Schema.optional(Schema.Boolean),
  disableDuet: Schema.optional(Schema.Boolean),
  disableStitch: Schema.optional(Schema.Boolean),
  brandedContent: Schema.optional(Schema.Boolean),
  ownBrand: Schema.optional(Schema.Boolean),
  aiGenerated: Schema.optional(Schema.Boolean),
  draft: Schema.optional(Schema.Boolean),
  creatorInfo: Schema.optional(JsonObject),
  photoCoverIndex: Schema.optional(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  ),
})

export type PlatformOverride = typeof PlatformOverride.Type

export const PostContent = Schema.Struct({
  text: Schema.String.check(Schema.isMaxLength(100_000)),
  mediaIds: Schema.Array(Id).check(Schema.isMaxLength(20)),
  channelIds: Schema.Array(Id).check(Schema.isMaxLength(40)),
  overrides: Schema.Array(PlatformOverride).check(Schema.isMaxLength(40)),
})

export type PostContent = typeof PostContent.Type

export const DeliveryState = Schema.Literals([
  "not-submitted",
  "scheduled",
  "accepted",
  "processing",
  "published",
  "failed",
  "cancelled",
  "unknown",
])

export type DeliveryState = typeof DeliveryState.Type

export const Delivery = Schema.Struct({
  id: Id,
  postId: Id,
  channelId: Id,
  platform: Platform,
  state: DeliveryState,
  message: Schema.NullOr(Schema.String),
  url: Schema.NullOr(Schema.String),
  providerPostId: Schema.NullOr(Schema.String),
  observedAt: Schema.String,
  retryDisposition: Schema.NullOr(
    Schema.Literals([
      "never",
      "after-delay",
      "after-reconnect",
      "reconcile-first",
    ]),
  ),
})

export type Delivery = typeof Delivery.Type

export const PostState = Schema.Literals([
  "draft",
  "scheduled",
  "pending",
  "published",
  "partial",
  "failed",
  "needs-review",
  "cancelled",
])

export const Post = Schema.Struct({
  id: Id,
  workspaceId: Id,
  content: PostContent,
  state: PostState,
  scheduledAt: Schema.NullOr(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
  deliveries: Schema.Array(Delivery),
  reviewReason: Schema.NullOr(Schema.String),
})

export type Post = typeof Post.Type

export const PostInput = Schema.Struct({ workspaceId: Id, postId: Id })

const Instant = Schema.String.check(
  Schema.makeFilter(
    (value) => {
      const parsed = DateTime.make(value)

      return Option.isSome(parsed) && DateTime.formatIso(parsed.value) === value
    },
    { message: "Use a canonical UTC ISO timestamp." },
  ),
)

export const PostCursor = Schema.Struct({ createdAt: Instant, id: Id })

export const PostListPageInput = Schema.Struct({
  workspaceId: Id,
  filter: Schema.Literals(["all", "draft", "queue", "sent", "calendar"]),
  channelId: Schema.optional(Id),
  scheduledFrom: Schema.optional(Instant),
  scheduledBefore: Schema.optional(Instant),
  limit: Schema.optional(
    Schema.Int.check(
      Schema.isGreaterThanOrEqualTo(1),
      Schema.isLessThanOrEqualTo(100),
    ),
  ),
  cursor: Schema.optional(PostCursor),
}).check(
  Schema.makeFilter(
    (value) =>
      !value.scheduledFrom ||
      !value.scheduledBefore ||
      value.scheduledFrom < value.scheduledBefore,
    { message: "Schedule range must end after its start." },
  ),
)

export const PostListPageResult = Schema.Struct({
  items: Schema.Array(Post),
  nextCursor: Schema.NullOr(PostCursor),
})

export const PostListInput = Schema.Struct({
  workspaceId: Id,
  filter: Schema.Literals(["all", "draft", "queue", "sent"]),
})

export const PostSaveInput = Schema.Struct({
  workspaceId: Id,
  postId: Schema.optional(Id),
  // Reuse this key when a new-post request is retried.
  idempotencyKey: Schema.optional(Id),
  content: PostContent,
  scheduledAt: Schema.NullOr(Schema.String),
})

export class PostRpc extends RpcGroup.make(
  Rpc.make("PostList", {
    payload: PostListInput,
    success: Schema.Array(Post),
    error: ApiError,
  }),
  Rpc.make("PostListPage", {
    payload: PostListPageInput,
    success: PostListPageResult,
    error: ApiError,
  }),
  Rpc.make("PostSave", {
    payload: PostSaveInput,
    success: Post,
    error: ApiError,
  }),
  Rpc.make("PostPublish", {
    payload: { workspaceId: Id, postId: Id, idempotencyKey: Id },
    success: Post,
    error: ApiError,
  }),
  Rpc.make("PostCancel", {
    payload: PostInput,
    success: Post,
    error: ApiError,
  }),
  Rpc.make("PostDelete", {
    payload: PostInput,
    success: Schema.Void,
    error: ApiError,
  }),
) {}
