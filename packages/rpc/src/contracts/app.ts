import { DateTime, Option, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { JsonObject } from "rpc/contracts/json"
import {
  Analytics,
  ApiError,
  Channel,
  ChannelOverview,
  DiscoveredAccount,
  Feed,
  FeedMode,
  Id,
  Member,
  Media,
  Name,
  Platform,
  Post,
  PostContent,
  PublicSession,
  Workspace,
  WorkspaceKind,
} from "rpc/contracts/models"
import { Authentication } from "rpc/middleware"

const WorkspaceInput = Schema.Struct({ workspaceId: Id })

const PostInput = Schema.Struct({ workspaceId: Id, postId: Id })

const FeedInput = Schema.Struct({ workspaceId: Id, feedId: Id })

export const WorkspaceTimezone = Name.check(
  Schema.makeFilter((value) => Option.isSome(DateTime.zoneMakeNamed(value)), {
    message: "Enter a valid IANA timezone.",
  }),
)

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

export const MediaListInput = Schema.Struct({
  workspaceId: Id,
  mediaIds: Schema.Array(Id).check(Schema.isMaxLength(20)),
})

export class AppRpc extends RpcGroup.make(
  Rpc.make("AccountDelete", {
    payload: { confirmation: Schema.Literal("DELETE") },
    success: Schema.Void,
    error: ApiError,
  }),
  Rpc.make("WorkspaceCreate", {
    payload: { name: Name, kind: WorkspaceKind, timezone: WorkspaceTimezone },
    success: Workspace,
    error: ApiError,
  }),
  Rpc.make("WorkspaceMembers", {
    payload: WorkspaceInput,
    success: Schema.Array(Member),
    error: ApiError,
  }),
  Rpc.make("WorkspaceInvite", {
    payload: {
      workspaceId: Id,
      email: Schema.String,
      role: Schema.Literals(["admin", "editor"]),
    },
    success: Schema.Struct({ url: Schema.String }),
    error: ApiError,
  }),
  Rpc.make("WorkspaceAcceptInvite", {
    payload: { token: Id },
    success: Workspace,
    error: ApiError,
  }),
  Rpc.make("WorkspaceTransfer", {
    payload: { workspaceId: Id, memberId: Id },
    success: Schema.Void,
    error: ApiError,
  }),
  Rpc.make("WorkspaceRemoveMember", {
    payload: { workspaceId: Id, userId: Id },
    success: Schema.Void,
    error: ApiError,
  }),
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
    payload: Schema.Struct({ workspaceId: Id, channelId: Id }),
    success: JsonObject,
    error: ApiError,
  }),
  Rpc.make("ChannelDisconnect", {
    payload: { workspaceId: Id, channelId: Id },
    success: Schema.Void,
    error: ApiError,
  }),
  Rpc.make("PostList", {
    payload: {
      workspaceId: Id,
      filter: Schema.Literals(["all", "draft", "queue", "sent"]),
    },
    success: Schema.Array(Post),
    error: ApiError,
  }),
  Rpc.make("PostListPage", {
    payload: PostListPageInput,
    success: PostListPageResult,
    error: ApiError,
  }),
  Rpc.make("MediaList", {
    payload: MediaListInput,
    success: Schema.Array(Media),
    error: ApiError,
  }),
  Rpc.make("PostSave", {
    payload: {
      workspaceId: Id,
      postId: Schema.optional(Id),
      content: PostContent,
      scheduledAt: Schema.NullOr(Schema.String),
    },
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
  Rpc.make("AnalyticsRead", {
    payload: WorkspaceInput,
    success: Analytics,
    error: ApiError,
  }),
)
  .middleware(Authentication)
  .add(Rpc.make("SessionRead", { success: PublicSession, error: ApiError })) {}
