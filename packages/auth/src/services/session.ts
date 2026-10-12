import { Context, DateTime, Effect, Result, Layer, Schema } from "effect"

import { authClient } from "auth/client"
import { subjects } from "auth/subjects"
import { CoreDb } from "db/services/core"
import { SessionDb } from "db/services/session"
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

const NativeTokens = Schema.Struct({
  access: Schema.String.check(Schema.isMinLength(1)),
  refresh: Schema.String.check(Schema.isMinLength(1)),
  expiresIn: Schema.Number.check(Schema.isFinite(), Schema.isGreaterThan(0)),
})

export function readAuthTokens(value: typeof NativeTokens.Type, now: number) {
  return Schema.decodeUnknownEffect(NativeTokens)(value).pipe(
    Effect.mapError(upstreamError),
    Effect.map((tokens) => ({
      ...tokens,
      accessExpiresAt: now + Math.min(tokens.expiresIn, 86400) * 1000,
    })),
  )
}

export function checkAuthentication<A, R>(
  operation: Effect.Effect<A, ApiError, R>,
) {
  return operation.pipe(
    Effect.catch((error) =>
      error.code === "unauthenticated"
        ? Effect.succeed(null)
        : Effect.fail(error),
    ),
  )
}

function makeSession(config: AppConfig) {
  return Effect.gen(function* () {
    const db = yield* CoreDb
    const sessions = yield* SessionDb
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
        try: (signal) =>
          authClient(config, signal).verify(subjects, access, {
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
      clearCookies: clear,
      authenticate(request: Request) {
        return Effect.gen(function* () {
          const access = readCookie(request, "access_token")
          const refresh = readCookie(request, "refresh_token")

          if (!access && !refresh) return { user: null, cookies: [] }
          const now = DateTime.toEpochMillis(yield* DateTime.now)

          const hashes = {
            accessHash: access ? yield* cipher.hash(access) : undefined,
            refreshHash: refresh ? yield* cipher.hash(refresh) : undefined,
            now,
          }

          const checked = yield* Effect.gen(function* () {
            const session = yield* sessions.find(hashes)

            if (session?.rotationStartedAt !== null) return null

            let rotated:
              | Effect.Success<ReturnType<typeof readAuthTokens>>
              | undefined

            const identity = yield* Effect.gen(function* () {
              if (access && session.accessExpiresAt > now) {
                const verification = yield* verified(access).pipe(Effect.result)

                if (Result.isSuccess(verification)) return verification.success

                if (verification.failure.code !== "unauthenticated")
                  return yield* Effect.fail(verification.failure)
              }

              if (!refresh || session.refreshExpiresAt <= now) return null

              if (!(yield* sessions.claimRotation(session, now))) return null

              const refreshed = yield* Effect.tryPromise({
                try: (signal) => authClient(config, signal).refresh(refresh),
                catch: upstreamError,
              })

              if (refreshed.err || !refreshed.tokens) return null
              rotated = yield* readAuthTokens(
                refreshed.tokens,
                DateTime.toEpochMillis(yield* DateTime.now),
              )

              return yield* verified(refreshed.tokens.access)
            })

            if (!identity) return null

            const user = yield* db.getUser(
              config.AUTH_ISSUER,
              identity.subject.properties.id,
            )

            if (!user || user.id !== session.userId) return null

            if (rotated) {
              const saved = yield* sessions.rotate(session, {
                ...session,
                accessHash: yield* cipher.hash(rotated.access),
                refreshHash: yield* cipher.hash(rotated.refresh),
                accessExpiresAt: rotated.accessExpiresAt,
                refreshExpiresAt: now + 604800000,
                rotationStartedAt: null,
                priorAccessHash: session.accessHash,
                priorRefreshHash: session.refreshHash,
                priorExpiresAt:
                  DateTime.toEpochMillis(yield* DateTime.now) + 30000,
              })

              if (!saved) return null
            }

            return {
              user,
              cookies: rotated ? tokens(rotated.access, rotated.refresh) : [],
            }
          }).pipe(
            Effect.timeoutOrElse({
              duration: "20 seconds",
              orElse: () => Effect.fail(upstreamError()),
            }),
            checkAuthentication,
          )

          if (checked) return checked

          const preserve = yield* sessions.preserveCookies({
            ...hashes,
            now: DateTime.toEpochMillis(yield* DateTime.now),
          })

          return { user: null, cookies: preserve ? [] : clear() }
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
            .pipe(Effect.result)

          if (Result.isFailure(attempt)) {
            if (attempt.failure.code === "storage-failure")
              return yield* Effect.fail(attempt.failure)

            return new Response("Invalid OAuth callback", {
              status: 400,
              headers: { "set-cookie": cleared, "cache-control": "no-store" },
            })
          }

          const verifier = yield* cipher.decrypt(attempt.success.verifier)

          const exchanged = yield* Effect.tryPromise({
            try: (signal) =>
              authClient(config, signal).exchange(
                code,
                config.AUTH_CALLBACK_URL,
                verifier,
              ),
            catch: upstreamError,
          })

          if (exchanged.err)
            return new Response("Login failed", {
              status: 400,
              headers: { "set-cookie": cleared, "cache-control": "no-store" },
            })

          const issued = yield* readAuthTokens(
            exchanged.tokens,
            DateTime.toEpochMillis(yield* DateTime.now),
          )

          const identity = yield* verified(issued.access)

          const user = yield* db.provisionUser(
            config.AUTH_ISSUER,
            identity.subject.properties,
          )

          const now = DateTime.toEpochMillis(yield* DateTime.now)
          yield* sessions.create({
            rotationStartedAt: null,
            priorAccessHash: null,
            priorRefreshHash: null,
            priorExpiresAt: null,
            id: crypto.randomUUID(),
            userId: user.id,
            accessHash: yield* cipher.hash(issued.access),
            refreshHash: yield* cipher.hash(issued.refresh),
            accessExpiresAt: issued.accessExpiresAt,
            refreshExpiresAt: now + 604800000,
          })

          return response(config.APP_ORIGIN, [
            cleared,
            ...tokens(issued.access, issued.refresh),
          ])
        })
      },
      logout(request: Request) {
        return checkOrigin(request).pipe(
          Effect.flatMap(() =>
            Effect.gen(function* () {
              const access = readCookie(request, "access_token")
              const refresh = readCookie(request, "refresh_token")
              yield* sessions.revoke({
                accessHash: access ? yield* cipher.hash(access) : undefined,
                refreshHash: refresh ? yield* cipher.hash(refresh) : undefined,
              })

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
          ),
        )
      },
    }
  })
}

export class AuthSession extends Context.Service<
  AuthSession,
  Effect.Success<ReturnType<typeof makeSession>>
>()("social/AuthSession") {}

export function authSessionLayer(config: AppConfig) {
  return Layer.effect(AuthSession, makeSession(config))
}
