import { Effect } from "effect"

import type { AppConfig } from "env/server"
import { ApiError } from "rpc/lib/errors"

export function failure(code: ApiError["code"], message: string) {
  return new ApiError({ code, message })
}

export function errorResponse(error: ApiError) {
  const statuses = {
    unauthenticated: 401,
    forbidden: 403,
    "not-found": 404,
    "invalid-input": 400,
    "not-configured": 503,
    conflict: 409,
    "upstream-failure": 502,
    "storage-failure": 500,
  }

  return Response.json(
    { error: error.message, code: error.code },
    { status: statuses[error.code], headers: { "cache-control": "no-store" } },
  )
}

export function checkOrigin(request: Request, config: AppConfig) {
  return request.headers.get("origin") === config.APP_ORIGIN
    ? Effect.void
    : Effect.fail(failure("forbidden", "Request origin denied"))
}

export function withCookies(response: Response, cookies: readonly string[]) {
  const headers = new Headers(response.headers)
  headers.set("cache-control", "no-store")

  for (const cookie of cookies) headers.append("set-cookie", cookie)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
