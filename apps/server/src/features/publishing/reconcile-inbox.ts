import { Effect } from "effect"
import { drainSocialInbox } from "server/features/channels/inbox"
import { PostService } from "server/features/posts/service"

import { CoreDb } from "db/services/client"

export function reconcileInbox() {
  return drainSocialInbox((event, workspaceId) =>
    Effect.gen(function* () {
      const db = yield* CoreDb
      const posts = yield* PostService
      const pending = yield* db.listPosts(workspaceId, "queue")
      const channels = yield* db.listChannels(workspaceId)

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
