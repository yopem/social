import { Effect } from "effect"
import { drainSocialInbox } from "server/features/channels/inbox"
import { PostService } from "server/features/posts/service"

import { ChannelsDb } from "db/services/channels"
import { PostsDb } from "db/services/posts"

export function reconcileInbox() {
  return drainSocialInbox((event, workspaceId) =>
    Effect.gen(function* () {
      const postsDb = yield* PostsDb
      const channelsDb = yield* ChannelsDb
      const posts = yield* PostService
      const pending = yield* postsDb.listPosts({ workspaceId, filter: "queue" })
      const channels = yield* channelsDb.listChannels(workspaceId)

      const affected = new Set(
        channels
          .filter(
            (channel) =>
              channel.platform === event.provider &&
              event.accountIds.includes(channel.accountId),
          )
          .map((channel) => channel.id),
      )

      yield* Effect.forEach(
        pending.filter(
          (post) =>
            post.state === "pending" &&
            post.deliveries.some(
              (delivery) =>
                affected.has(delivery.channelId) &&
                (!event.backendRecordId ||
                  delivery.providerPostId === event.backendRecordId),
            ),
        ),
        (post) => posts.reconcile(workspaceId, post.id),
        { concurrency: 2, discard: true },
      )
    }),
  )
}
