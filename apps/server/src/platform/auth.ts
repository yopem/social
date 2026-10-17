import { Effect } from "effect"
import { errorResponse, failure } from "server/platform/http"

import { AuthSession } from "auth/services/session"

export function authRequest(request: Request) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname
    const auth = yield* AuthSession

    if (path === "/auth/login" && request.method === "GET")
      return yield* auth.startLogin(request)

    if (path === "/auth/callback" && request.method === "GET")
      return yield* auth.completeLogin(request)

    if (path === "/auth/logout" && request.method === "POST")
      return yield* auth.logout(request)

    return errorResponse(failure("not-found", "Authentication route not found"))
  })
}
