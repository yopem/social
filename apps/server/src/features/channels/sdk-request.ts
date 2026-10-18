import { SocialError } from "@opencoredev/social-sdk"
import { Effect } from "effect"

import { ApiError } from "rpc/lib/errors"

export function sdkError<E>(error: E) {
  if (error instanceof ApiError) return error

  if (error instanceof SocialError) {
    const code =
      error.code === "unauthorized"
        ? "forbidden"
        : error.code === "invalid_input" || error.code === "timeout"
          ? "invalid-input"
          : error.code === "idempotency_conflict"
            ? "conflict"
            : "upstream-failure"

    return new ApiError({
      code,
      message:
        code === "upstream-failure"
          ? "Social provider operation failed"
          : "Social operation rejected: check permissions, connection state, and platform settings",
    })
  }

  return new ApiError({
    code: "upstream-failure",
    message: "Social provider operation failed",
  })
}

export function sdkRequest<A>(request: (signal: AbortSignal) => Promise<A>) {
  return Effect.tryPromise({ try: request, catch: sdkError })
}
