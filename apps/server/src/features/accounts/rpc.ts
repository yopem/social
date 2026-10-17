import { Effect } from "effect"
import { AccountDeletion } from "server/features/accounts/deletion"

import { AccountRpc } from "rpc/contracts/accounts"
import { Authentication, CurrentUser } from "rpc/middleware"

export function accountRpcHandlers() {
  return AccountRpc.middleware(Authentication).toLayer(
    Effect.gen(function* () {
      const deletion = yield* AccountDeletion

      return {
        AccountDelete: () =>
          Effect.flatMap(CurrentUser, (user) => deletion.remove(user.id)),
      }
    }),
  )
}
