import type { ApplicationDependencies } from "server/application"

import { Effect, Layer, Schema, Scope, Stream } from "effect"
import { HttpEffect, HttpServer } from "effect/http"
import { RpcSerialization, RpcServer } from "effect/rpc"
import { accountRpcHandlers } from "server/features/accounts/rpc"
import { analyticsRpcHandlers } from "server/features/analytics/rpc"
import { channelRpcHandlers } from "server/features/channels/rpc"
import { feedRpcHandlers } from "server/features/feeds/rpc"
import { mediaRpcHandlers } from "server/features/media/rpc"
import { postRpcHandlers } from "server/features/posts/rpc"
import { sessionRpcHandlers } from "server/features/session/rpc"
import { workspaceRpcHandlers } from "server/features/workspaces/rpc"
import { readStream, requestBytes } from "server/platform/egress"
import {
  checkOrigin,
  errorResponse,
  failure,
  withCookies,
} from "server/platform/http"

import { AuthSession } from "auth/services/session"
import { DeletionDb } from "db/services/accounts/deletion"
import type { AppConfig } from "env/server"
import { AppRpc } from "rpc/app"
import { Authentication, CurrentUser, RequestIdentity } from "rpc/middleware"

export function rpcHandlers(config: AppConfig) {
  return Layer.mergeAll(
    accountRpcHandlers(),
    sessionRpcHandlers(),
    workspaceRpcHandlers(config),
    channelRpcHandlers(),
    postRpcHandlers(),
    mediaRpcHandlers(),
    feedRpcHandlers(),
    analyticsRpcHandlers(),
  )
}

export function rpcRequest(request: Request, config: AppConfig) {
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
