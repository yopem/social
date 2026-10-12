import type { AppConfig } from "env/server"

import { AuthSession } from "auth/services/session"
import { CoreDb } from "db/services/core"
import { fixtureDatabaseStats, migrateLocalFixtures } from "db/services/migrations"
import { Effect, Schema } from "effect"
import { WorkerResources } from "env/server"
import { JobService } from "server/jobs/handler"
import { drainSocialInbox, socialWebhook } from "server/handlers/webhooks"

import initial from "../../packages/db/src/migrations/0001_initial.sql?raw"
import social from "../../packages/db/src/migrations/0002_social.sql?raw"
import { fixtureError, fixtureJson, fixtureSignIn } from "./auth"
import { fixtureConnections } from "./connections"
import { ChannelScenario } from "./social"

export function fixtureRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname
    if (!path.startsWith("/__fixtures/")) return null
    if (config.APP_ORIGIN !== "http://localhost:3000") return yield* Effect.fail(fixtureError("Fixture origin denied"))
    const resources = yield* WorkerResources
    if (path === "/__fixtures/migrate" && request.method === "POST") {
      yield* migrateLocalFixtures(resources.DB, config.APP_ORIGIN, [initial, social])
      return Response.json({ migrated: true })
    }
    if (path === "/__fixtures/session" && request.method === "POST") return yield* fixtureSignIn(request, config)
    if (path === "/__fixtures/webhook" && request.method === "POST") {
      const response = yield* socialWebhook(new Request(`${config.APP_ORIGIN}/webhooks/facebook`, request), { ...config, FACEBOOK_CLIENT_SECRET: "isolated-e2e-webhook-key" })
      yield* drainSocialInbox(() => Effect.void)
      return response
    }
    const auth = yield* AuthSession
    const session = yield* auth.authenticate(request)
    if (!session.user) return new Response(null, { status: 401 })
    const core = yield* CoreDb
    const workspaces = yield* core.listWorkspaces(session.user.id)
    const hint = new URL(request.url).searchParams.get("workspace")
    const workspace = hint ? workspaces.find((value) => value.id === hint) : workspaces.find((value) => value.role === "editor") ?? workspaces[0]
    if (!workspace) return yield* Effect.fail(fixtureError("Fixture workspace missing"))
    const userId = session.user.id
    const workspaceId = workspace.id
    const connections = yield* fixtureConnections()
    if (path === "/__fixtures/channels" && request.method === "POST") {
      const { scenario } = yield* fixtureJson(request, ChannelScenario)
      const platforms = scenario === "mixed" ? ["x", "threads", "bluesky"] as const : scenario === "video-required" ? ["youtube"] as const : scenario === "tiktok" ? ["tiktok"] as const : ["x", "facebook"] as const
      for (const platform of platforms) {
        const displayName = platform === "tiktok" ? "TikTok Creator" : `Alex on ${platform === "youtube" ? "YouTube" : platform === "x" ? "X" : platform[0]?.toUpperCase() + platform.slice(1)}`
        const started = yield* connections.begin(userId, workspaceId, platform, scenario, displayName)
        yield* connections.discover(userId, workspaceId, started.attempt.id, started.attempt.state, displayName)
        yield* connections.select(userId, workspaceId, started.attempt.id, [`fixture-${platform}`])
      }
      return Response.json({ channels: yield* core.listChannels(workspaceId) })
    }
    if (path === "/__fixtures/connection/begin" && request.method === "POST") {
      const started = yield* connections.begin(userId, workspaceId, "x")
      return Response.json({ id: started.attempt.id, state: started.attempt.state })
    }
    if (path === "/__fixtures/connection/discover" && request.method === "POST") {
      const input = yield* fixtureJson(request, Schema.Struct({ id: Schema.String, state: Schema.String }))
      return Response.json(yield* connections.discover(userId, workspaceId, input.id, input.state))
    }
    if (path === "/__fixtures/connection/select" && request.method === "POST") {
      const input = yield* fixtureJson(request, Schema.Struct({ id: Schema.String, accountId: Schema.String }))
      return Response.json(yield* connections.select(userId, workspaceId, input.id, [input.accountId]))
    }
    if (path === "/__fixtures/queue-delivery" && request.method === "POST") {
      const input = yield* fixtureJson(request, Schema.Struct({ duplicate: Schema.Boolean, scenario: Schema.Literal("unknown") }))
      const started = yield* connections.begin(userId, workspaceId, "x", input.scenario)
      yield* connections.discover(userId, workspaceId, started.attempt.id, started.attempt.state)
      yield* connections.select(userId, workspaceId, started.attempt.id, ["fixture-x"])
      const channel = (yield* core.listChannels(workspaceId)).find((value) => value.platform === "x")
      if (!channel) return yield* Effect.fail(fixtureError("Fixture queue channel missing"))
      const post = yield* core.savePost(workspaceId, { text: "Queue fixture", channelIds: [channel.id], mediaIds: [], overrides: [] }, null)
      const jobs = yield* JobService
      const message = { type: "publish" as const, workspaceId, postId: post.id, operationKey: `fixture:${post.id}` }
      yield* Effect.tryPromise({ try: () => resources.JOBS.send(message), catch: () => fixtureError("Fixture queue send failed") })
      yield* jobs.handle(message)
      if (input.duplicate) yield* jobs.handle(message)
      yield* jobs.handle({ type: "reconcile", workspaceId, postId: post.id })
      const saved = yield* core.getPost(workspaceId, post.id)
      const stats = yield* fixtureDatabaseStats(resources.DB, workspaceId)
      return Response.json({ dispatches: stats.dispatches, state: saved.deliveries[0]?.state ?? "not-submitted" })
    }
    const stats = yield* fixtureDatabaseStats(resources.DB, workspaceId)
    if (path === "/__fixtures/grants") return Response.json({ count: stats.grants })
    if (path === "/__fixtures/connection/stats") return Response.json({ codeExchanges: stats.codeExchanges, grants: stats.grants })
    if (path === "/__fixtures/inbox") return Response.json({ processed: stats.processed, quarantined: stats.quarantined })
    return Response.json({ error: "Fixture route not found" }, { status: 404 })
  })
}
