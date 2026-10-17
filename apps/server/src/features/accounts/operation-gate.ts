import { Context, Effect, Layer } from "effect"

import { DeletionDb } from "db/services/accounts/deletion"
import { ApiError } from "rpc/lib/errors"

function makeGate() {
  return Effect.gen(function* () {
    const db = yield* DeletionDb

    function run<A, E, R>(
      userId: string,
      workspaceId: string | null,
      operation: Effect.Effect<A, E, R>,
    ) {
      return Effect.acquireUseRelease(
        db.acquireOperation(userId, workspaceId),
        () =>
          operation.pipe(
            Effect.uninterruptible,
            Effect.timeoutOrElse({
              duration: "90 seconds",
              orElse: () =>
                Effect.fail(
                  new ApiError({
                    code: "upstream-failure",
                    message: "Account operation timed out.",
                  }),
                ),
            }),
          ),
        (token) =>
          db
            .releaseOperation(token)
            .pipe(Effect.catch((error) => Effect.logError(error.message))),
      )
    }

    function wrap<Args extends readonly unknown[], A, E, R>(
      operation: (
        userId: string,
        workspaceId: string,
        ...args: Args
      ) => Effect.Effect<A, E, R>,
    ) {
      return function guardedOperation(
        userId: string,
        workspaceId: string,
        ...args: Args
      ) {
        return run(userId, workspaceId, operation(userId, workspaceId, ...args))
      }
    }

    return { run, wrap }
  })
}

export class OperationGate extends Context.Service<
  OperationGate,
  Effect.Success<ReturnType<typeof makeGate>>
>()("social/OperationGate") {}

export const operationGateLayer = Layer.effect(OperationGate, makeGate())
