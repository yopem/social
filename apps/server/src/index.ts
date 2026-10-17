import type {
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types"
import type { AccountDeletion } from "server/features/accounts/deletion"
import type { OperationGate } from "server/features/accounts/operation-gate"
import type { SocialService } from "server/features/channels/service"
import type { FeedService } from "server/features/feeds/service"
import type { Egress } from "server/platform/egress"

import { Effect, Layer, Schema, Scope, Stream } from "effect"
import { HttpEffect, HttpServer } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { accountDeletionLayer } from "server/features/accounts/deletion"
import { operationGateLayer } from "server/features/accounts/operation-gate"
import {
  socialCallback,
  socialClientMetadata,
} from "server/features/channels/callback"
import { socialLayer } from "server/features/channels/service"
import {
  drainSocialInbox,
  socialWebhook,
} from "server/features/channels/webhooks"
import { feedLayer } from "server/features/feeds/service"
import { MediaService, mediaLayer } from "server/features/media/service"
import { PostService, postLayer } from "server/features/posts/service"
import {
  JobService,
  jobLayer,
  processQueue,
} from "server/features/publishing/jobs"
import { egressLayer, readStream, requestBytes } from "server/platform/egress"
import { rpcHandlers } from "server/rpc"

import type { CredentialCrypto } from "auth/services/crypto"
import { credentialCryptoLayer } from "auth/services/crypto"
import { AuthSession, authSessionLayer } from "auth/services/session"
import { DeletionDb, deletionDbLayer } from "db/services/accounts/deletion"
import type { SocialDb } from "db/services/channels/social"
import { socialDbLayer } from "db/services/channels/social"
import { CoreDb, coreDbLayer } from "db/services/client"
import { RetentionDb, retentionDbLayer } from "db/services/retention"
import type { SessionDb } from "db/services/session"
import { sessionDbLayer } from "db/services/session"
import type { AppConfig, WorkerBindings, WorkerResources } from "env/server"
import { ConfigService, loadConfig, resourceLayer } from "env/server"
import { AppRpc } from "rpc/app"
import { ApiError } from "rpc/lib/errors"
import { Authentication, CurrentUser, RequestIdentity } from "rpc/middleware"

export type ApplicationDependencies =
  | AuthSession
  | CoreDb
  | DeletionDb
  | SessionDb
  | RetentionDb
  | AccountDeletion
  | OperationGate
  | SocialDb
  | CredentialCrypto
  | SocialService
  | JobService
  | MediaService
  | PostService
  | FeedService
  | WorkerResources
  | ConfigService
  | Egress

export interface ApplicationOverrides {
  readonly auth?: Layer.Layer<
    AuthSession,
    ApiError,
    CoreDb | SessionDb | CredentialCrypto
  >
  readonly social?: Layer.Layer<
    SocialService,
    ApiError,
    CoreDb | SocialDb | CredentialCrypto | OperationGate
  >
  readonly egress?: Layer.Layer<Egress, ApiError>
}

export function applicationLayer(
  bindings: WorkerBindings,
  config: AppConfig,
  overrides: ApplicationOverrides = {},
) {
  const base = Layer.mergeAll(
    resourceLayer(bindings),
    Layer.succeed(ConfigService, config),
    coreDbLayer(bindings),
    deletionDbLayer(bindings.DB),
    sessionDbLayer(bindings.DB),
    retentionDbLayer(bindings.DB),
    socialDbLayer(bindings.DB),
    credentialCryptoLayer(config),
    overrides.egress ?? egressLayer,
  )

  const guarded = operationGateLayer.pipe(Layer.provideMerge(base))

  const services = Layer.mergeAll(
    overrides.auth ?? authSessionLayer(config),
    overrides.social ?? socialLayer(config),
    mediaLayer(bindings, config),
  ).pipe(Layer.provideMerge(guarded))

  const domain = Layer.mergeAll(
    postLayer,
    feedLayer,
    accountDeletionLayer,
  ).pipe(Layer.provideMerge(services))

  return jobLayer().pipe(Layer.provideMerge(domain))
}

function failure(code: ApiError["code"], message: string) {
  return new ApiError({ code, message })
}

function errorResponse(error: ApiError) {
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

function checkOrigin(request: Request, config: AppConfig) {
  return request.headers.get("origin") === config.APP_ORIGIN
    ? Effect.void
    : Effect.fail(failure("forbidden", "Request origin denied"))
}

function withCookies(response: Response, cookies: readonly string[]) {
  const headers = new Headers(response.headers)
  headers.set("cache-control", "no-store")

  for (const cookie of cookies) headers.append("set-cookie", cookie)

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function rpcRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const auth = yield* AuthSession
    const session = yield* auth.authenticate(request)

    const result = yield* Effect.gen(function* () {
      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { Allow: "POST" } })
      yield* checkOrigin(request, config)
      const type = request.headers.get("content-type")?.split(";")[0]?.trim()

      if (type !== "application/ndjson" && type !== "application/json")
        return yield* Effect.fail(
          failure("invalid-input", "Unsupported RPC content type"),
        )
      const body = yield* requestBytes(request, 1048576)

      if (!session.user) {
        const messages = yield* Effect.try({
          try: () => RpcSerialization.ndjson.makeUnsafe().decode(body),
          catch: () => failure("invalid-input", "Invalid RPC request"),
        })

        const requests = yield* Schema.decodeUnknownEffect(
          Schema.Array(Schema.Struct({ tag: Schema.optional(Schema.String) })),
        )(messages).pipe(
          Effect.mapError(() =>
            failure("invalid-input", "Invalid RPC request"),
          ),
        )

        for (const message of requests) {
          const rpc = Array.from(AppRpc.requests.values()).find(
            (rpc) => rpc._tag === message.tag,
          )

          if (rpc && rpc.middlewares.size > 0)
            return yield* Effect.fail(
              failure("unauthenticated", "Sign in required"),
            )
        }
      }

      const context = yield* Effect.context<ApplicationDependencies>()

      const layer = rpcHandlers(config).pipe(
        Layer.provide(Layer.succeedContext(context)),
        Layer.provide(Layer.succeed(RequestIdentity, session.user)),
        Layer.merge(
          Layer.succeed(Authentication, (effect) =>
            session.user
              ? Effect.provideService(effect, CurrentUser, session.user)
              : Effect.fail(failure("unauthenticated", "Sign in required")),
          ),
        ),
        Layer.merge(RpcSerialization.layerNdjson),
        Layer.merge(HttpServer.layerServices),
        Layer.merge(Layer.effect(Scope.Scope, Scope.Scope)),
      )

      return yield* Effect.acquireUseRelease(
        Effect.sync(() =>
          HttpEffect.toWebHandlerLayerWith(layer, {
            toHandler: (context) =>
              RpcServer.toHttpEffect(AppRpc, { disableTracing: true }).pipe(
                Effect.provideContext(context),
              ),
          }),
        ),
        (handler) =>
          Effect.gen(function* () {
            const response = yield* Effect.tryPromise({
              try: () =>
                handler.handler(
                  new Request(request.url, {
                    method: "POST",
                    headers: request.headers,
                    body,
                  }),
                ),
              catch: () => failure("upstream-failure", "RPC request failed"),
            })

            const bytes = yield* readStream(
              Stream.fromReadableStream({
                evaluate: () =>
                  response.body ??
                  new ReadableStream<Uint8Array>({
                    start(controller) {
                      controller.close()
                    },
                  }),
                onError: () =>
                  failure("upstream-failure", "RPC response failed"),
              }),
              16 * 1048576,
            )

            return new Response(bytes, {
              status: response.status,
              headers: response.headers,
            })
          }).pipe(
            Effect.timeoutOrElse({
              duration: "120 seconds",
              orElse: () =>
                Effect.fail(
                  failure("upstream-failure", "RPC request timed out"),
                ),
            }),
          ),
        (handler) => Effect.promise(() => handler.dispose()),
      )
    }).pipe(Effect.catch((error) => Effect.succeed(errorResponse(error))))

    if (session.user) {
      const db = yield* DeletionDb
      const exists = yield* db.userExists(session.user.id)

      if (!exists) return withCookies(result, auth.clearCookies())
    }

    return withCookies(result, session.cookies)
  })
}

export function apiRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/rpc" || path === "/rpc/")
      return yield* rpcRequest(request, config)

    if (path.startsWith("/rpc/"))
      return errorResponse(failure("not-found", "RPC route not found"))

    if (path.startsWith("/auth/")) {
      const auth = yield* AuthSession

      if (path === "/auth/login" && request.method === "GET")
        return yield* auth.startLogin(request)

      if (path === "/auth/callback" && request.method === "GET")
        return yield* auth.completeLogin(request)

      if (path === "/auth/logout" && request.method === "POST")
        return yield* auth.logout(request)

      return errorResponse(
        failure("not-found", "Authentication route not found"),
      )
    }

    if (path.startsWith("/webhooks/"))
      return yield* socialWebhook(request, config, {
        metaVerifyToken: config.FACEBOOK_WEBHOOK_VERIFY_TOKEN,
        youtubeSecret: config.YOUTUBE_WEBHOOK_SECRET,
        youtubeTopics: config.YOUTUBE_WEBHOOK_TOPICS,
      })

    if (path.startsWith("/social/callback/"))
      return yield* socialCallback(request, config)

    if (
      config.BLUESKY_CLIENT_ID &&
      url.origin + path === config.BLUESKY_CLIENT_ID
    )
      return yield* socialClientMetadata(request, config)

    if (path.startsWith("/media/")) {
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
    }

    if (
      /^\/(?:api|rpc|auth|social|media|webhooks|__fixtures)(?:\/|$)/.test(path)
    )
      return errorResponse(failure("not-found", "API route not found"))

    return null
  })
}

function drainInbox() {
  return drainSocialInbox((event, workspaceId) =>
    Effect.gen(function* () {
      const db = yield* CoreDb
      const posts = yield* PostService
      const pending = yield* db.listPosts(workspaceId, "queue")
      const channels = yield* db.listChannels(workspaceId)

      const affected = new Set(
        channels
          .filter(
            (channel) =>
              channel.platform === event.provider &&
              event.accountIds.includes(channel.accountId),
          )
          .map((channel) => channel.id),
      )

      yield* Effect.forEach(
        pending.filter(
          (post) =>
            post.state === "pending" &&
            post.deliveries.some(
              (delivery) =>
                affected.has(delivery.channelId) &&
                (!event.backendRecordId ||
                  delivery.providerPostId === event.backendRecordId),
            ),
        ),
        (post) => posts.reconcile(workspaceId, post.id),
        { concurrency: 2, discard: true },
      )
    }),
  )
}

// Cloudflare and DOM types use different Response declarations.
const AssetResponse = Schema.declare(
  (value: unknown): value is Response => value instanceof Response,
)

function frontendRequest(
  request: Request,
  bindings: WorkerBindings,
  frontend: ApplicationWorkerOptions["frontend"],
) {
  return Effect.gen(function* () {
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      })
    const path = new URL(request.url).pathname

    if (
      frontend &&
      [
        "/",
        "/drafts",
        "/calendar",
        "/channels",
        "/rss",
        "/analytics",
        "/settings",
        "/invite",
        "/tos",
        "/privacy-policy",
      ].includes(path)
    )
      return yield* Effect.tryPromise({
        try: () => frontend(request, bindings),
        catch: () => failure("upstream-failure", "Frontend request failed"),
      })

    const assets = bindings.ASSETS

    if (!assets) return errorResponse(failure("not-found", "Route not found"))

    return yield* Effect.tryPromise({
      try: () =>
        assets.fetch(request.url, {
          method: request.method,
          headers: Object.fromEntries(request.headers.entries()),
        }),
      catch: () => failure("upstream-failure", "Asset request failed"),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(AssetResponse)),
      Effect.mapError(() =>
        failure("upstream-failure", "Asset request failed"),
      ),
    )
  })
}

export interface ApplicationWorkerOptions {
  readonly overrides?: (config: AppConfig) => ApplicationOverrides
  readonly fixtureRequest?: (
    request: Request,
    config: AppConfig,
  ) => Effect.Effect<Response | null, ApiError, ApplicationDependencies>
  readonly frontend?: (
    request: Request,
    bindings: WorkerBindings,
  ) => Promise<Response>
}

export function createApplicationWorker(
  options: ApplicationWorkerOptions = {},
) {
  function run<A, E>(
    bindings: WorkerBindings,
    execute: (
      config: AppConfig,
    ) => Effect.Effect<A, E, ApplicationDependencies>,
  ) {
    return Effect.flatMap(loadConfig(bindings), (config) =>
      execute(config).pipe(
        Effect.provide(
          applicationLayer(bindings, config, options.overrides?.(config)),
        ),
      ),
    )
  }

  return {
    fetch(request: Request, bindings: WorkerBindings) {
      return Effect.runPromise(
        run(bindings, (config) =>
          Effect.gen(function* () {
            const fixture = options.fixtureRequest
              ? yield* options.fixtureRequest(request, config)
              : null

            if (fixture) return fixture
            const response = yield* apiRequest(request, config)

            if (response) return response

            return yield* frontendRequest(request, bindings, options.frontend)
          }),
        ).pipe(
          Effect.catch((error) =>
            Effect.succeed(
              errorResponse(
                error instanceof ApiError
                  ? error
                  : failure(
                      "not-configured",
                      "Application resources unavailable",
                    ),
              ),
            ),
          ),
        ),
      )
    },
    queue(batch: MessageBatch<unknown>, bindings: WorkerBindings) {
      return Effect.runPromise(
        run(bindings, () =>
          Effect.gen(function* () {
            yield* processQueue(batch.messages)
            yield* drainInbox()
          }),
        ),
      )
    },
    scheduled(_controller: ScheduledController, bindings: WorkerBindings) {
      return Effect.runPromise(
        run(bindings, () =>
          Effect.gen(function* () {
            const retention = yield* RetentionDb
            yield* retention.cleanup()
            const jobs = yield* JobService
            yield* jobs.enqueueDue()
            yield* drainInbox()
          }),
        ),
      )
    },
  }
}
