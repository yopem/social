import { Effect, Schema } from "effect"
import {
  blueskyMetadata,
  SocialService,
} from "server/features/channels/service"

import { CredentialCrypto } from "auth/services/crypto"
import { AuthSession } from "auth/services/session"
import { SocialDb } from "db/services/channels/social"
import type { AppConfig } from "env/server"
import { Platform } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"

export function socialCallback(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers: { Allow: "GET" } })

    const url = yield* Effect.try({
      try: () => new URL(request.url),
      catch: () =>
        new ApiError({
          code: "invalid-input",
          message: "Invalid callback URL",
        }),
    })

    const platform = yield* Schema.decodeUnknownEffect(Platform)(
      url.pathname.split("/")[3],
    ).pipe(
      Effect.mapError(
        () =>
          new ApiError({
            code: "invalid-input",
            message: "Unsupported callback platform",
          }),
      ),
    )

    if (
      url.origin !== config.APP_ORIGIN ||
      url.pathname !== `/social/callback/${platform}`
    )
      return yield* Effect.fail(
        new ApiError({
          code: "invalid-input",
          message: "Invalid callback route",
        }),
      )
    const state = url.searchParams.get("state")

    if (
      !state ||
      url.searchParams.getAll("state").length !== 1 ||
      url.searchParams.getAll("code").length > 1
    )
      return yield* Effect.fail(
        new ApiError({
          code: "invalid-input",
          message: "Callback state is missing or ambiguous",
        }),
      )
    const auth = yield* AuthSession
    const session = yield* auth.authenticate(request)

    if (!session.user) {
      const headers = new Headers({ "cache-control": "no-store" })

      for (const cookie of session.cookies) headers.append("set-cookie", cookie)

      return new Response("Sign in before completing this connection", {
        status: 401,
        headers,
      })
    }

    const cipher = yield* CredentialCrypto
    const db = yield* SocialDb
    const stateHash = yield* cipher.hash(state)
    const attempt = yield* db.attemptByState(stateHash)

    if (
      !attempt ||
      attempt.platform !== platform ||
      attempt.principal_id !== session.user.id
    )
      return yield* Effect.fail(
        new ApiError({
          code: "forbidden",
          message:
            "Callback does not match this principal's connection attempt",
        }),
      )
    const social = yield* SocialService
    yield* social.discover(
      session.user.id,
      attempt.tenant_id,
      attempt.id,
      request.url,
    )

    const query = new URLSearchParams({
      workspace: attempt.tenant_id,
      attempt: attempt.id,
    })

    const headers = new Headers({
      location: `${config.APP_ORIGIN}/channels?${query}`,
      "cache-control": "no-store",
    })

    for (const cookie of session.cookies) headers.append("set-cookie", cookie)

    return new Response(null, { status: 302, headers })
  })
}

export function socialClientMetadata(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    if (request.method !== "GET")
      return new Response(null, { status: 405, headers: { Allow: "GET" } })

    if (!config.BLUESKY_CLIENT_ID)
      return new Response("Bluesky client is not configured", { status: 503 })
    const metadata = yield* blueskyMetadata(config)

    return Response.json(metadata, {
      headers: { "cache-control": "public, max-age=300" },
    })
  })
}
