import { Effect } from "effect"
import { SocialService } from "server/features/channels/service"

import { AnalyticsRpc } from "rpc/contracts/analytics"
import { Authentication, CurrentUser } from "rpc/middleware"

export function analyticsRpcHandlers() {
  return AnalyticsRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const social = yield* SocialService

      return {
        AnalyticsRead: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            social.analytics(user.id, input.workspaceId),
          ),
      }
    }),
  )
}
