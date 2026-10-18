import { Effect } from "effect"
import { SocialService } from "server/features/channels/service"

import { ChannelsDb } from "db/services/channels"
import { WorkspacesDb } from "db/services/workspaces"
import { ChannelRpc } from "rpc/contracts/channels"
import { Authentication, CurrentUser } from "rpc/middleware"

export function channelRpcHandlers() {
  return ChannelRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const workspacesDb = yield* WorkspacesDb
      const channelsDb = yield* ChannelsDb
      const social = yield* SocialService

      return {
        ChannelList: (input) =>
          Effect.gen(function* () {
            const user = yield* CurrentUser
            yield* workspacesDb.workspaceAccess({
              userId: user.id,
              workspaceId: input.workspaceId,
            })

            return {
              channels: yield* channelsDb.listChannels(input.workspaceId),
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
      }
    }),
  )
}
