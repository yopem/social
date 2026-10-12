import { Context, Effect, Layer } from "effect"

import { DeletionDb } from "db/services/deletion"
import { WorkerResources } from "env/server"
import { ApiError } from "rpc/contracts/models"

function makeDeletion() {
  return Effect.gen(function* () {
    const db = yield* DeletionDb
    const resources = yield* WorkerResources

    function remove(userId: string) {
      return Effect.gen(function* () {
        const workspaces = yield* db.begin(userId)

        for (const workspace of workspaces) {
          let cursor: string | undefined

          do {
            const objects = yield* Effect.tryPromise({
              try: () =>
                resources.MEDIA.list({
                  prefix: `${workspace.workspace_id}/`,
                  cursor,
                }),
              catch: () =>
                new ApiError({
                  code: "storage-failure",
                  message: "Media deletion failed. Retry account deletion.",
                }),
            })

            if (objects.objects.length) {
              yield* Effect.tryPromise({
                try: () =>
                  resources.MEDIA.delete(
                    objects.objects.map((object) => object.key),
                  ),
                catch: () =>
                  new ApiError({
                    code: "storage-failure",
                    message: "Media deletion failed. Retry account deletion.",
                  }),
              })
            }

            cursor = objects.truncated ? objects.cursor : undefined
          } while (cursor !== undefined)
        }

        yield* db.finish(userId)
      })
    }

    return { remove }
  })
}

export class AccountDeletion extends Context.Service<
  AccountDeletion,
  Effect.Success<ReturnType<typeof makeDeletion>>
>()("social/AccountDeletion") {}

export const accountDeletionLayer = Layer.effect(
  AccountDeletion,
  makeDeletion(),
)
