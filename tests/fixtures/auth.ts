import { DateTime, Effect, Layer, Option, Schema } from "effect"

import { CredentialCrypto } from "auth/services/crypto"
import { AuthSession, authSessionLayer } from "auth/services/session"
import { CoreDb } from "db/services/core"
import type { AppConfig } from "env/server"
import { ApiError, Session } from "rpc/contracts/models"

const Identity = Schema.Literal("owner", "editor", "outsider")

const Ticket = Schema.Struct({
  namespace: Schema.UUID,
  identity: Identity,
  expiresAt: Schema.Number,
})

const Namespace = Schema.Struct({ namespace: Schema.UUID })

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
  schema: Schema.Schema<A, I>,
) {
  return Effect.tryPromise({
    try: () => request.json(),
    catch: () => fixtureError("Invalid fixture request"),
  }).pipe(
    Effect.flatMap(Schema.decodeUnknown(schema)),
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
    const { identity } = yield* fixtureJson(
      request,
      Schema.Struct({ identity: Identity }),
    )

    const cipher = yield* CredentialCrypto
    const db = yield* CoreDb
    const old = fixtureCookie(request, "fixture_namespace")

    const namespace = old
      ? (yield* cipher.decrypt(old).pipe(
          Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Namespace))),
          Effect.mapError(() => fixtureError("Invalid fixture namespace")),
        )).namespace
      : crypto.randomUUID()

    const user = yield* db.provisionUser(
      config.AUTH_ISSUER,
      subject(namespace, identity),
    )

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

    const session = yield* Schema.decodeUnknown(Session)({
      user,
      workspaces: yield* db.listWorkspaces(user.id),
    }).pipe(Effect.mapError(() => fixtureError("Invalid fixture session")))

    const token = yield* cipher.encrypt(
      JSON.stringify({
        namespace,
        identity,
        expiresAt: DateTime.toEpochMillis(yield* DateTime.now) + 86400000,
      }),
    )

    const namespaceToken = yield* cipher.encrypt(JSON.stringify({ namespace }))
    const headers = new Headers({ "cache-control": "no-store" })
    headers.append(
      "set-cookie",
      `access_token=${token}; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax`,
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

      return {
        ...live,
        authenticate(request: Request) {
          return Effect.gen(function* () {
            const token = fixtureCookie(request, "access_token")

            if (!token) return { user: null, cookies: [] }

            const now = yield* DateTime.now

            const ticket = yield* cipher.decrypt(token).pipe(
              Effect.flatMap(Schema.decodeUnknown(Schema.parseJson(Ticket))),
              Effect.filterOrFail(
                (value) => value.expiresAt > DateTime.toEpochMillis(now),
                () => fixtureError("Expired fixture session"),
              ),
              Effect.option,
            )

            if (Option.isNone(ticket))
              return {
                user: null,
                cookies: [
                  "access_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax",
                ],
              }

            return {
              user: yield* db.getUser(
                config.AUTH_ISSUER,
                subject(ticket.value.namespace, ticket.value.identity).id,
              ),
              cookies: [],
            }
          })
        },
      }
    }),
  )
}
