import { Schema } from "effect"

import { JsonObject } from "rpc/contracts/json"

export const Id = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512),
)

export const Name = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500),
)

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

export const Role = Schema.Literals(["owner", "admin", "editor"])

export type Role = typeof Role.Type

export const WorkspaceKind = Schema.Literals(["personal", "organization"])

export const User = Schema.Struct({ id: Id, name: Name, email: Schema.String })

export type User = typeof User.Type

export const Workspace = Schema.Struct({
  id: Id,
  name: Name,
  kind: WorkspaceKind,
  timezone: Name,
  role: Role,
})

export type Workspace = typeof Workspace.Type

export const Member = Schema.Struct({
  user: User,
  role: Role,
})

export type Member = typeof Member.Type

export const Session = Schema.Struct({
  user: User,
  workspaces: Schema.Array(Workspace),
})

export type Session = typeof Session.Type

export const PublicSession = Schema.Struct({
  user: Schema.NullOr(User),
  workspaces: Schema.Array(Workspace),
})

export type PublicSession = typeof PublicSession.Type

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

export const Media = Schema.Struct({
  id: Id,
  workspaceId: Id,
  name: Name,
  mediaType: Schema.String,
  kind: Schema.Literals(["image", "video"]),
  bytes: Schema.Number,
  url: Schema.String,
})

export type Media = typeof Media.Type

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

export const DiscoveredAccount = Schema.Struct({
  accountId: Id,
  platform: Platform,
  displayName: Name,
})

export type DiscoveredAccount = typeof DiscoveredAccount.Type

export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  code: Schema.Literals([
    "unauthenticated",
    "forbidden",
    "not-found",
    "invalid-input",
    "not-configured",
    "conflict",
    "upstream-failure",
    "storage-failure",
  ]),
  message: Schema.String,
}) {}
