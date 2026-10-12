import { Effect } from "effect"
import { AccountDeletion } from "server/services/deletion"
import { FeedService } from "server/services/feeds"
import { OperationGate } from "server/services/operation-gate"
import { PostService } from "server/services/posts"
import { SocialService } from "server/services/social"

import { CoreDb } from "db/services/core"
import type { AppConfig } from "env/server"
import { AppRpc } from "rpc/contracts/app"
import { CurrentUser, RequestIdentity } from "rpc/middleware"

export function rpcHandlers(config: AppConfig) {
  return AppRpc.toLayer(
    Effect.gen(function* () {
      const db = yield* CoreDb
      const social = yield* SocialService
      const posts = yield* PostService
      const feeds = yield* FeedService
      const deletion = yield* AccountDeletion
      const gate = yield* OperationGate

      function guarded<A, E, R>(operation: Effect.Effect<A, E, R>) {
        return Effect.flatMap(CurrentUser, (user) =>
          gate.run(user.id, null, operation),
        )
      }

      return {
        AccountDelete: () =>
          Effect.flatMap(CurrentUser, (user) => deletion.remove(user.id)),
        SessionRead: () =>
          Effect.gen(function* () {
            const user = yield* RequestIdentity

            return {
              user,
              workspaces: user ? yield* db.listWorkspaces(user.id) : [],
            }
          }),
        WorkspaceCreate: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.createWorkspace(user.id, input.name, input.kind, input.timezone),
          ).pipe(guarded),
        WorkspaceMembers: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.members(user.id, input.workspaceId),
          ),
        WorkspaceInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.invite(user.id, input.workspaceId, input.email, input.role),
          ).pipe(
            guarded,
            Effect.map(({ token }) => ({
              url: `${config.APP_ORIGIN}/invite?token=${encodeURIComponent(token)}`,
            })),
          ),
        WorkspaceAcceptInvite: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.acceptInvite(user, input.token),
          ).pipe(guarded),
        WorkspaceTransfer: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            gate.run(
              user.id,
              input.workspaceId,
              db.transferOwnership(user.id, input.workspaceId, input.memberId),
            ),
          ),
        WorkspaceRemoveMember: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            db.removeMember(user.id, input.workspaceId, input.userId),
          ).pipe(guarded),
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
