import { Effect } from "effect"
import { FeedService } from "server/services/feeds"
import { PostService } from "server/services/posts"
import { SocialService } from "server/services/social"

import { CoreDb } from "db/services/core"
import type { AppConfig } from "env/server"
import { AppRpc } from "rpc/contracts/app"
import { CurrentUser } from "rpc/middleware"

export function rpcHandlers(config: AppConfig) {
  return AppRpc.toLayer(
    Effect.gen(function* () {
      const db = yield* CoreDb
      const social = yield* SocialService
      const posts = yield* PostService
      const feeds = yield* FeedService

      return {
        SessionRead: () =>
          Effect.gen(function* () {
            const user = yield* CurrentUser

            return { user, workspaces: yield* db.listWorkspaces(user.id) }
          }),
        WorkspaceCreate: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.createWorkspace(user.id, input.name, input.kind, input.timezone),
          ),
        WorkspaceMembers: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.members(user.id, input.workspaceId),
          ),
        WorkspaceInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.invite(user.id, input.workspaceId, input.email, input.role),
          ).pipe(
            Effect.map(({ token }) => ({
              url: `${config.APP_ORIGIN}/invite?token=${encodeURIComponent(token)}`,
            })),
          ),
        WorkspaceAcceptInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.acceptInvite(user, input.token),
          ),
        WorkspaceRemoveMember: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.removeMember(user.id, input.workspaceId, input.userId),
          ),
        ChannelList: (input) =>
          Effect.gen(function* () {
            const user = yield* CurrentUser
            yield* db.workspaceAccess(user.id, input.workspaceId)

            return {
              channels: yield* db.listChannels(input.workspaceId),
              platforms: yield* social.availability(),
            }
          }),
        ConnectionBegin: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.begin(
              user.id,
              input.workspaceId,
              input.platform,
              input.loginHint,
            ),
          ),
        ConnectionAccounts: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.discovered(user.id, input.workspaceId, input.attemptId),
          ),
        ConnectionSelect: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.select(
              user.id,
              input.workspaceId,
              input.attemptId,
              input.accountIds,
            ),
          ),
        TikTokCreatorInfo: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.tiktokCreatorInfo(
              user.id,
              input.workspaceId,
              input.channelId,
            ),
          ),
        ChannelDisconnect: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.disconnect(user.id, input.workspaceId, input.channelId),
          ),
        PostList: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.list(user.id, input.workspaceId, input.filter),
          ),
        PostSave: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.save(
              user.id,
              input.workspaceId,
              input.content,
              input.scheduledAt,
              input.postId,
            ),
          ),
        PostPublish: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.publish(
              user.id,
              input.workspaceId,
              input.postId,
              input.idempotencyKey,
            ),
          ),
        PostCancel: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.cancel(user.id, input.workspaceId, input.postId),
          ),
        PostDelete: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.remove(user.id, input.workspaceId, input.postId),
          ),
        FeedList: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            feeds.list(user.id, input.workspaceId),
          ),
        FeedSave: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            feeds.save(user.id, input.workspaceId, input, input.feedId),
          ),
        FeedRefresh: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            feeds.refresh(user.id, input.workspaceId, input.feedId),
          ),
        FeedDelete: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            feeds.remove(user.id, input.workspaceId, input.feedId),
          ),
        AnalyticsRead: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.analytics(user.id, input.workspaceId),
          ),
      }
    }),
  )
}
