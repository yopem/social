import type {
  MessageBatch,
  ScheduledController,
} from "@cloudflare/workers-types"
import type {
  ApplicationDependencies,
  ApplicationOverrides,
} from "server/application"

import { Effect, Schema } from "effect"
import { applicationLayer } from "server/application"
import {
  socialCallback,
  socialClientMetadata,
} from "server/features/channels/callback"
import { socialWebhook } from "server/features/channels/webhooks"
import { mediaRequest } from "server/features/media/http"
import { JobService, processQueue } from "server/features/publishing/jobs"
import { reconcileInbox } from "server/features/publishing/reconcile-inbox"
import { authRequest } from "server/platform/auth"
import { errorResponse, failure } from "server/platform/http"
import { rpcRequest } from "server/rpc"

import { RetentionDb } from "db/services/retention"
import type { AppConfig, WorkerBindings } from "env/server"
import { loadConfig } from "env/server"
import { ApiError } from "rpc/lib/errors"

export function apiRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const url = new URL(request.url)
    const path = url.pathname

    if (path === "/rpc" || path === "/rpc/")
      return yield* rpcRequest(request, config)

    if (path.startsWith("/rpc/"))
      return errorResponse(failure("not-found", "RPC route not found"))

    if (path.startsWith("/auth/")) return yield* authRequest(request)

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

    if (path.startsWith("/media/")) return yield* mediaRequest(request, config)

    if (
      /^\/(?:api|rpc|auth|social|media|webhooks|__fixtures)(?:\/|$)/.test(path)
    )
      return errorResponse(failure("not-found", "API route not found"))

    return null
  })
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
            yield* reconcileInbox()
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
            yield* reconcileInbox()
          }),
        ),
      )
    },
  }
}
