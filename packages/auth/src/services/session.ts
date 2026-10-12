import { Context, DateTime, Effect, Either, Layer } from "effect"

import { authClient } from "auth/client"
import { subjects } from "auth/subjects"
import { CoreDb } from "db/services/core"
import type { AppConfig } from "env/server"
import { ApiError } from "rpc/contracts/models"

import { CredentialCrypto } from "./crypto"

function upstreamError() {
  return new ApiError({
    code: "upstream-failure",
    message: "Authentication service failed",
  })
}

function invalidError() {
  return new ApiError({
    code: "unauthenticated",
    message: "Invalid authentication session",
  })
}

function readCookie(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

function makeSession(config: AppConfig) {
  return Effect.gen(function* () {
    const db = yield* CoreDb
    const cipher = yield* CredentialCrypto
    const client = authClient(config)

    function cookie(name: string, value: string, maxAge: number, path = "/") {
      return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${config.APP_ORIGIN.startsWith("https:") ? "; Secure" : ""}`
    }

    function clear() {
      return [cookie("access_token", "", 0), cookie("refresh_token", "", 0)]
    }

    function tokens(access: string, refresh: string) {
      return [
        cookie("access_token", access, 86400),
        cookie("refresh_token", refresh, 604800),
      ]
    }

    function response(location: string, cookies: readonly string[]) {
      const headers = new Headers({ location, "cache-control": "no-store" })

      for (const value of cookies) headers.append("set-cookie", value)

      return new Response(null, { status: 302, headers })
    }

    function verified(access: string, refresh?: string) {
      return Effect.tryPromise({
        try: () =>
          client.verify(subjects, access, {
            audience: config.AUTH_CLIENT_ID,
            refresh,
          }),
        catch: upstreamError,
      }).pipe(
        Effect.flatMap((result) =>
          result.err ||
          result.aud !== config.AUTH_CLIENT_ID ||
          result.subject.type !== "user"
            ? Effect.fail(invalidError())
            : Effect.succeed(result),
        ),
      )
    }

    function checkOrigin(request: Request) {
      return Effect.gen(function* () {
        if (request.headers.get("origin") !== config.APP_ORIGIN)
          return yield* Effect.fail(
            new ApiError({
              code: "forbidden",
              message: "Request origin denied",
            }),
          )
      })
    }

    return {
      authenticate(request: Request) {
        return Effect.gen(function* () {
          const access = readCookie(request, "access_token")
          const refresh = readCookie(request, "refresh_token")

          if (!access && !refresh) return { user: null, cookies: [] }
          let active = access
          let rotated: { access: string; refresh: string } | undefined

          if (!active && refresh) {
            const result = yield* Effect.tryPromise({
              try: () => client.refresh(refresh),
              catch: upstreamError,
            })

            if (result.err || !result.tokens)
              return { user: null, cookies: clear() }
            rotated = result.tokens
            active = result.tokens.access
          }

          if (!active) return { user: null, cookies: clear() }

          const verification = yield* verified(active, refresh).pipe(
            Effect.either,
          )

          if (Either.isLeft(verification)) {
            if (verification.left.code !== "unauthenticated")
              return yield* Effect.fail(verification.left)

            return { user: null, cookies: clear() }
          }

          const result = verification.right
          const updated = result.tokens ?? rotated

          const user = yield* db.getUser(
            config.AUTH_ISSUER,
            result.subject.properties.id,
          )

          return {
            user,
            cookies: user
              ? updated
                ? tokens(updated.access, updated.refresh)
                : []
              : clear(),
          }
        })
      },
      startLogin(request: Request) {
        return Effect.gen(function* () {
          if (new URL(request.url).origin !== config.APP_ORIGIN)
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Application origin denied",
              }),
            )

          const result = yield* Effect.tryPromise({
            try: () =>
              client.authorize(config.AUTH_CALLBACK_URL, "code", {
                pkce: true,
                provider: "google",
              }),
            catch: upstreamError,
          })

          if (!result.challenge.verifier)
            return yield* Effect.fail(upstreamError())
          const nonce = `${crypto.randomUUID()}${crypto.randomUUID()}`
          const nonceHash = yield* cipher.hash(nonce)
          const verifier = yield* cipher.encrypt(result.challenge.verifier)
          yield* db.saveAuthAttempt({
            state: result.challenge.state,
            nonceHash,
            verifier,
            expiresAt: yield* DateTime.now.pipe(
              Effect.map((time) =>
                DateTime.formatIso(DateTime.addDuration(time, "10 minutes")),
              ),
            ),
          })

          return response(result.url, [
            cookie("oauth_challenge", nonce, 600, "/auth"),
          ])
        })
      },
      completeLogin(request: Request) {
        return Effect.gen(function* () {
          const url = new URL(request.url)
          const state = url.searchParams.get("state")
          const code = url.searchParams.get("code")
          const nonce = readCookie(request, "oauth_challenge")
          const cleared = cookie("oauth_challenge", "", 0, "/auth")

          if (
            url.origin + url.pathname !== config.AUTH_CALLBACK_URL ||
            !state ||
            !code ||
            !nonce
          )
            return new Response("Invalid OAuth callback", {
              status: 400,
              headers: { "set-cookie": cleared, "cache-control": "no-store" },
            })

          const attempt = yield* db
            .consumeAuthAttempt(state, yield* cipher.hash(nonce))
            .pipe(Effect.either)

          if (Either.isLeft(attempt)) {
            if (attempt.left.code === "storage-failure")
              return yield* Effect.fail(attempt.left)

            return new Response("Invalid OAuth callback", {
              status: 400,
              headers: { "set-cookie": cleared, "cache-control": "no-store" },
            })
          }

          const verifier = yield* cipher.decrypt(attempt.right.verifier)

          const exchanged = yield* Effect.tryPromise({
            try: () =>
              client.exchange(code, config.AUTH_CALLBACK_URL, verifier),
            catch: upstreamError,
          })

          if (exchanged.err)
            return new Response("Login failed", {
              status: 400,
              headers: { "set-cookie": cleared, "cache-control": "no-store" },
            })
          const identity = yield* verified(exchanged.tokens.access)
          yield* db.provisionUser(
            config.AUTH_ISSUER,
            identity.subject.properties,
          )

          return response(config.APP_ORIGIN, [
            cleared,
            ...tokens(exchanged.tokens.access, exchanged.tokens.refresh),
          ])
        })
      },
      logout(request: Request) {
        return checkOrigin(request).pipe(
          Effect.map(() => {
            const headers = new Headers({
              "content-type": "application/json",
              "cache-control": "no-store",
            })

            for (const value of [
              ...clear(),
              cookie("oauth_challenge", "", 0, "/auth"),
            ])
              headers.append("set-cookie", value)

            return new Response('{"ok":true}', { headers })
          }),
        )
      },
    }
  })
}

export class AuthSession extends Context.Tag("social/AuthSession")<
  AuthSession,
  Effect.Effect.Success<ReturnType<typeof makeSession>>
>() {}

export function authSessionLayer(config: AppConfig) {
  return Layer.effect(AuthSession, makeSession(config))
}
