import { Effect } from "effect"
import { FeedService } from "server/features/feeds/service"

import { FeedRpc } from "rpc/contracts/feeds"
import { Authentication, CurrentUser } from "rpc/middleware"

export function feedRpcHandlers() {
  return FeedRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const feeds = yield* FeedService

      return {
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
      }
    }),
  )
}
