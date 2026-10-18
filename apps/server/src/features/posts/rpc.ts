import { Effect } from "effect"
import { PostService } from "server/features/posts/service"

import { PostRpc } from "rpc/contracts/posts"
import { Authentication, CurrentUser } from "rpc/middleware"

export function postRpcHandlers() {
  return PostRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const posts = yield* PostService

      return {
        PostList: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.list(user.id, input.workspaceId, input.filter),
          ),
        PostListPage: (input) =>
          Effect.flatMap(CurrentUser, (user) => posts.listPage(user.id, input)),
        PostSave: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.save({ ...input, userId: user.id }),
          ),
        PostPublish: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.publish({
              userId: user.id,
              workspaceId: input.workspaceId,
              postId: input.postId,
              operationKey: input.idempotencyKey,
            }),
          ),
        PostCancel: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.cancel(user.id, input.workspaceId, input.postId),
          ),
        PostDelete: (input) =>
          Effect.flatMap(CurrentUser, (user) =>
            posts.remove(user.id, input.workspaceId, input.postId),
          ),
      }
    }),
  )
}
