import type {
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types"
import type { Egress } from "server/lib/egress"
import type { FeedService } from "server/services/feeds"
import type { SocialService } from "server/services/social"

import { HttpServer } from "@effect/platform"
import { RpcSerialization, RpcServer } from "@effect/rpc"
import { Effect, Layer, Schema, Stream } from "effect"
import {
  socialCallback,
  socialClientMetadata,
} from "server/handlers/social-callback"
import { drainSocialInbox, socialWebhook } from "server/handlers/webhooks"
import { JobService, jobLayer } from "server/jobs/handler"
import { egressLayer, readStream, requestBytes } from "server/lib/egress"
import { rpcHandlers } from "server/rpc/app"
import { feedLayer } from "server/services/feeds"
import { PostService, postLayer } from "server/services/posts"
import { socialLayer } from "server/services/social"
import { MediaService, mediaLayer } from "server/storage/media"

import type { CredentialCrypto } from "auth/services/crypto"
import { credentialCryptoLayer } from "auth/services/crypto"
import { AuthSession, authSessionLayer } from "auth/services/session"
import { CoreDb, coreDbLayer } from "db/services/core"
import type { SocialDb } from "db/services/social"
import { socialDbLayer } from "db/services/social"
import type { AppConfig, WorkerBindings, WorkerResources } from "env/server"
import {
  ConfigService,
  JobMessage,
  loadConfig,
  resourceLayer,
} from "env/server"
import { AppRpc } from "rpc/contracts/app"
import { ApiError } from "rpc/contracts/models"
import { Authentication } from "rpc/middleware"

export type ApplicationDependencies =
  | AuthSession
  | CoreDb
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
  readonly auth?: Layer.Layer<AuthSession, ApiError, CoreDb | CredentialCrypto>
  readonly social?: Layer.Layer<
    SocialService,
    ApiError,
    CoreDb | SocialDb | CredentialCrypto
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
    socialDbLayer(bindings.DB),
    credentialCryptoLayer(config),
    overrides.egress ?? egressLayer,
  )

  const services = Layer.mergeAll(
    overrides.auth ?? authSessionLayer(config),
    overrides.social ?? socialLayer(config),
    mediaLayer(bindings, config),
  ).pipe(Layer.provideMerge(base))

  const domain = Layer.mergeAll(postLayer, feedLayer).pipe(
    Layer.provideMerge(services),
  )

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
      if (!session.user)
        return yield* Effect.fail(
          failure("unauthenticated", "Sign in required"),
        )

      if (request.method !== "POST")
        return new Response(null, { status: 405, headers: { Allow: "POST" } })
      yield* checkOrigin(request, config)
      const type = request.headers.get("content-type")?.split(";")[0]?.trim()

      if (type !== "application/ndjson" && type !== "application/json")
        return yield* Effect.fail(
          failure("invalid-input", "Unsupported RPC content type"),
        )
      const body = yield* requestBytes(request, 1048576)
      const context = yield* Effect.context<ApplicationDependencies>()

      const layer = rpcHandlers(config).pipe(
        Layer.provide(Layer.succeedContext(context)),
        Layer.merge(
          Layer.succeed(Authentication, () => Effect.succeed(session.user)),
        ),
        Layer.merge(RpcSerialization.layerNdjson),
        Layer.merge(HttpServer.layerContext),
      )

      return yield* Effect.acquireUseRelease(
        Effect.sync(() =>
          RpcServer.toWebHandler(AppRpc, { layer, disableTracing: true }),
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
              Stream.fromReadableStream(
                () =>
                  response.body ??
                  new ReadableStream<Uint8Array>({
                    start(controller) {
                      controller.close()
                    },
                  }),
                () => failure("upstream-failure", "RPC response failed"),
              ),
              16 * 1048576,
            )

            return new Response(bytes, {
              status: response.status,
              headers: response.headers,
            })
          }).pipe(
            Effect.timeoutFail({
              duration: "120 seconds",
              onTimeout: () =>
                failure("upstream-failure", "RPC request timed out"),
            }),
          ),
        (handler) => Effect.promise(() => handler.dispose()),
      )
    }).pipe(Effect.catchAll((error) => Effect.succeed(errorResponse(error))))

    return withCookies(result, session.cookies)
  })
}

export function apiRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/rpc") return yield* rpcRequest(request, config)

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
      return yield* socialWebhook(request, config)

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
      }).pipe(Effect.catchAll((error) => Effect.succeed(errorResponse(error))))

      return withCookies(response, session.cookies)
    }

    if (path.startsWith("/api/") || path.startsWith("/social/"))
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

            if (options.frontend)
              return yield* Effect.tryPromise({
                try: () => options.frontend!(request, bindings),
                catch: () =>
                  failure("upstream-failure", "Frontend request failed"),
              })

            return errorResponse(failure("not-found", "Route not found"))
          }),
        ).pipe(
          Effect.catchAll((error) =>
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
            const jobs = yield* JobService
            yield* Effect.forEach(
              batch.messages,
              (message) =>
                Schema.decodeUnknown(JobMessage)(message.body).pipe(
                  Effect.flatMap(jobs.handle),
                  Effect.match({
                    onSuccess: () => message.ack(),
                    onFailure: () =>
                      message.retry({
                        delaySeconds: Math.min(
                          300,
                          2 ** Math.min(message.attempts, 8),
                        ),
                      }),
                  }),
                ),
              { concurrency: 4, discard: true },
            )
            yield* drainInbox()
          }),
        ),
      )
    },
    scheduled(_controller: ScheduledController, bindings: WorkerBindings) {
      return Effect.runPromise(
        run(bindings, () =>
          Effect.flatMap(JobService, (jobs) => jobs.enqueueDue()).pipe(
            Effect.zipRight(drainInbox()),
          ),
        ),
      )
    },
  }
}
