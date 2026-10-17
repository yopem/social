import { Effect } from "effect"
import { MediaService } from "server/features/media/service"

import { MediaRpc } from "rpc/contracts/media"
import { Authentication, CurrentUser } from "rpc/middleware"

export function mediaRpcHandlers() {
  return MediaRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const media = yield* MediaService

      return {
        MediaList: (input) =>
          Effect.flatMap(CurrentUser, (user) => media.list(user.id, input)),
      }
    }),
  )
}
