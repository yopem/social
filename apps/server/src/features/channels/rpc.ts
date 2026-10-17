import { Effect } from "effect"
import { SocialService } from "server/features/channels/service"

import { CoreDb } from "db/services/client"
import { ChannelRpc } from "rpc/contracts/channels"
import { Authentication, CurrentUser } from "rpc/middleware"

export function channelRpcHandlers() {
  return ChannelRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const db = yield* CoreDb
      const social = yield* SocialService

      return {
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
      }
    }),
  )
}
