import { DateTime, Effect, Layer, Schema } from "effect"

import { CredentialCrypto } from "auth/services/crypto"
import {
  AuthSession,
  authSessionLayer,
  checkAuthentication,
  readAuthTokens,
} from "auth/services/session"
import { CoreDb } from "db/services/client"
import { SessionDb } from "db/services/session"
import type { AppConfig } from "env/server"
import { Session } from "rpc/contracts/session"
import { ApiError } from "rpc/lib/errors"
import { Name } from "rpc/lib/schema"

const Identity = Schema.Literals(["owner", "editor", "outsider"])

const Ticket = Schema.Struct({
  namespace: Schema.String.check(Schema.isUUID()),
  identity: Identity,
  expiresAt: Schema.Number,
})

const Namespace = Schema.Struct({
  namespace: Schema.String.check(Schema.isUUID()),
})

export function fixtureCookie(request: Request, name: string) {
  return request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

export function fixtureError(message: string) {
  return new ApiError({ code: "invalid-input", message })
}

export function fixtureJson<A, I>(
  request: Request,
  schema: Schema.Codec<A, I>,
) {
  return Effect.tryPromise({
    try: () => request.json(),
    catch: () => fixtureError("Invalid fixture request"),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(schema)),
    Effect.mapError(() => fixtureError("Invalid fixture request")),
  )
}

function subject(namespace: string, identity: typeof Identity.Type) {
  const profiles = {
    owner: {
      name: "Alex Morgan",
      email: `owner-${namespace}@fixtures.example.test`,
    },
    editor: {
      name: "Jamie Editor",
      email: `editor-${namespace}@fixtures.example.test`,
    },
    outsider: {
      name: "Outside User",
      email: `outsider-${namespace}@fixtures.example.test`,
    },
  }

  return { id: `${namespace}:${identity}`, ...profiles[identity] }
}

export function fixtureSignIn(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const { identity, mode, name } = yield* fixtureJson(
      request,
      Schema.Struct({
        identity: Identity,
        name: Schema.optional(Name),
        mode: Schema.optional(
          Schema.Literals([
            "expired-access",
            "expired-session",
            "short-access",
          ]),
        ),
      }),
    )

    const cipher = yield* CredentialCrypto
    const db = yield* CoreDb
    const old = fixtureCookie(request, "fixture_namespace")

    const namespace = old
      ? (yield* cipher.decrypt(old).pipe(
          Effect.flatMap(
            Schema.decodeUnknownEffect(Schema.fromJsonString(Namespace)),
          ),
          Effect.mapError(() => fixtureError("Invalid fixture namespace")),
        )).namespace
      : crypto.randomUUID()

    const profile = subject(namespace, identity)

    const user = yield* db.provisionUser(config.AUTH_ISSUER, {
      ...profile,
      name: name ?? profile.name,
    })

    if (identity === "editor") {
      const owner = yield* db.provisionUser(
        config.AUTH_ISSUER,
        subject(namespace, "owner"),
      )

      const workspaces = yield* db.listWorkspaces(owner.id)

      let shared = workspaces.find(
        (workspace) => workspace.name === "Shared Editor Workspace",
      )

      shared ??= yield* db.createWorkspace(
        owner.id,
        "Shared Editor Workspace",
        "organization",
        "UTC",
      )
      const current = yield* db.listWorkspaces(user.id)

      if (!current.some((workspace) => workspace.id === shared.id)) {
        const invite = yield* db.invite(
          owner.id,
          shared.id,
          user.email,
          "editor",
        )

        yield* db.acceptInvite(user, invite.token)
      }
    }

    const session = yield* Schema.decodeUnknownEffect(Session)({
      user,
      workspaces: yield* db.listWorkspaces(user.id),
    }).pipe(Effect.mapError(() => fixtureError("Invalid fixture session")))

    const now = DateTime.toEpochMillis(yield* DateTime.now)

    const issued = yield* readAuthTokens(
      {
        access: "isolated-access-token",
        refresh: "isolated-refresh-token",
        expiresIn: mode === "short-access" ? 1 : 86400,
      },
      now,
    )

    const accessExpiresAt =
      mode === "expired-access" || mode === "expired-session"
        ? now - 1
        : issued.accessExpiresAt

    const refreshExpiresAt =
      mode === "expired-session" ? now - 1 : now + 604800000

    const token = yield* cipher.encrypt(
      JSON.stringify({ namespace, identity, expiresAt: accessExpiresAt }),
    )

    const refresh = yield* cipher.encrypt(
      JSON.stringify({ namespace, identity, expiresAt: refreshExpiresAt }),
    )

    const sessions = yield* SessionDb
    yield* sessions.create({
      rotationStartedAt: null,
      priorAccessHash: null,
      priorRefreshHash: null,
      priorExpiresAt: null,
      id: crypto.randomUUID(),
      userId: user.id,
      accessHash: yield* cipher.hash(token),
      refreshHash: yield* cipher.hash(refresh),
      accessExpiresAt,
      refreshExpiresAt,
    })
    const namespaceToken = yield* cipher.encrypt(JSON.stringify({ namespace }))
    const headers = new Headers({ "cache-control": "no-store" })
    headers.append(
      "set-cookie",
      `access_token=${token}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
    )
    headers.append(
      "set-cookie",
      `refresh_token=${refresh}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
    )
    headers.append(
      "set-cookie",
      `fixture_namespace=${namespaceToken}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
    )

    return Response.json(session, { headers })
  })
}

export function fixtureAuthLayer(config: AppConfig) {
  return Layer.effect(
    AuthSession,
    Effect.gen(function* () {
      const live = yield* AuthSession.pipe(
        Effect.provide(authSessionLayer(config)),
      )

      const cipher = yield* CredentialCrypto
      const db = yield* CoreDb
      const sessions = yield* SessionDb

      return {
        ...live,
        authenticate(request: Request) {
          return Effect.gen(function* () {
            const access = fixtureCookie(request, "access_token")
            const refresh = fixtureCookie(request, "refresh_token")

            if (!access && !refresh) return { user: null, cookies: [] }
            const now = DateTime.toEpochMillis(yield* DateTime.now)

            const hashes = {
              accessHash: access ? yield* cipher.hash(access) : undefined,
              refreshHash: refresh ? yield* cipher.hash(refresh) : undefined,
              now,
            }

            const checked = yield* Effect.gen(function* () {
              const fault = request.headers.get("x-fixture-auth-fault")

              if (
                config.APP_ORIGIN === "http://localhost:3200" &&
                (fault === "upstream" || fault === "storage")
              ) {
                yield* Effect.tryPromise({
                  try: (): Promise<void> =>
                    Promise.reject(new Error("Isolated authentication outage")),
                  catch: () =>
                    new ApiError({
                      code:
                        fault === "upstream"
                          ? "upstream-failure"
                          : "storage-failure",
                      message: "Authentication fixture temporarily unavailable",
                    }),
                })
              }

              const session = yield* sessions.find(hashes)

              if (session?.rotationStartedAt !== null) return null
              const rotate = !access || session.accessExpiresAt <= now
              const token = rotate ? refresh : access

              if (!token || (rotate && session.refreshExpiresAt <= now))
                return null

              const ticket = yield* cipher.decrypt(token).pipe(
                Effect.flatMap(
                  Schema.decodeUnknownEffect(Schema.fromJsonString(Ticket)),
                ),
                Effect.mapError(
                  () =>
                    new ApiError({
                      code: "unauthenticated",
                      message: "Invalid fixture session",
                    }),
                ),
                Effect.filterOrFail(
                  (value) => value.expiresAt > now,
                  () =>
                    new ApiError({
                      code: "unauthenticated",
                      message: "Expired fixture session",
                    }),
                ),
              )

              const user = yield* db.getUser(
                config.AUTH_ISSUER,
                subject(ticket.namespace, ticket.identity).id,
              )

              if (!user || user.id !== session.userId) return null

              if (!rotate) return { user, cookies: [] }

              if (!(yield* sessions.claimRotation(session, now))) return null

              const nextAccess = yield* cipher.encrypt(
                JSON.stringify({ ...ticket, expiresAt: now + 86400000 }),
              )

              const nextRefresh = yield* cipher.encrypt(
                JSON.stringify({ ...ticket, expiresAt: now + 604800000 }),
              )

              const saved = yield* sessions.rotate(session, {
                ...session,
                rotationStartedAt: null,
                priorAccessHash: session.accessHash,
                priorRefreshHash: session.refreshHash,
                priorExpiresAt: now + 30000,
                accessHash: yield* cipher.hash(nextAccess),
                refreshHash: yield* cipher.hash(nextRefresh),
                accessExpiresAt: now + 86400000,
                refreshExpiresAt: now + 604800000,
              })

              if (!saved) return null

              return {
                user,
                cookies: [
                  `access_token=${nextAccess}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
                  `refresh_token=${nextRefresh}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`,
                ],
              }
            }).pipe(checkAuthentication)

            if (checked) return checked

            const preserve = yield* sessions.preserveCookies({
              ...hashes,
              now: DateTime.toEpochMillis(yield* DateTime.now),
            })

            return { user: null, cookies: preserve ? [] : live.clearCookies() }
          })
        },
      }
    }),
  )
}
