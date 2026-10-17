import { Effect } from "effect"
import { MediaService } from "server/features/media/service"
import {
  checkOrigin,
  errorResponse,
  failure,
  withCookies,
} from "server/platform/http"

import { AuthSession } from "auth/services/session"
import type { AppConfig } from "env/server"

export function mediaRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const url = new URL(request.url)
    const path = url.pathname
    const media = yield* MediaService

    if (
      path.startsWith("/media/public/") &&
      ["GET", "HEAD"].includes(request.method)
    )
      return yield* media.publicDownload(
        path.slice("/media/public/".length),
        request,
      )
    const auth = yield* AuthSession
    const session = yield* auth.authenticate(request)

    const response = yield* Effect.gen(function* () {
      if (!session.user)
        return yield* Effect.fail(
          failure("unauthenticated", "Sign in required"),
        )

      if (path === "/media/upload" && request.method === "POST") {
        yield* checkOrigin(request, config)
        const workspace = url.searchParams.get("workspace")

        if (!workspace || !request.body)
          return yield* Effect.fail(
            failure("invalid-input", "Workspace and media body required"),
          )

        const name = yield* Effect.try({
          try: () =>
            decodeURIComponent(request.headers.get("x-file-name") ?? ""),
          catch: () => failure("invalid-input", "Invalid file name"),
        })

        const length = request.headers.get("content-length")
        const declaredLength = length === null ? undefined : Number(length)

        if (
          declaredLength !== undefined &&
          (!Number.isSafeInteger(declaredLength) || declaredLength < 0)
        )
          return yield* Effect.fail(
            failure("invalid-input", "Invalid content length"),
          )

        return Response.json(
          yield* media.upload(
            session.user.id,
            workspace,
            name,
            request.headers.get("content-type") ?? "",
            request.body,
            declaredLength,
          ),
        )
      }

      if (
        ["GET", "HEAD"].includes(request.method) &&
        /^\/media\/[^/]+$/.test(path)
      )
        return yield* media.download(session.user.id, path.slice(7), request)

      return errorResponse(failure("not-found", "Media route not found"))
    }).pipe(Effect.catch((error) => Effect.succeed(errorResponse(error))))

    return withCookies(response, session.cookies)
  })
}
