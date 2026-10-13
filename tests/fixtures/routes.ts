import { Effect, Match, Schema } from "effect"
import { drainSocialInbox, socialWebhook } from "server/handlers/webhooks"
import { JobService } from "server/jobs/handler"

import { AuthSession } from "auth/services/session"
import { CoreDb } from "db/services/core"
import { DeletionDb } from "db/services/deletion"
import {
  fixtureDatabaseStats,
  verifyLocalFixtureDatabase,
} from "db/services/migrations"
import { SocialDb } from "db/services/social"
import type { AppConfig } from "env/server"
import { WorkerResources } from "env/server"

import { fixtureError, fixtureJson, fixtureSignIn } from "./auth"
import { fixtureConnections } from "./connections"
import {
  deletionLegacyOtherFixture,
  deletionFixtureSetup,
  deletionFixtureVerify,
  deletionRemoteFixture,
} from "./deletion"
import { deletionGateFixture } from "./deletion-gate"
import { deletionInvitationRace } from "./deletion-race"
import { ownershipFixtureGuards } from "./ownership"
import { reconciliationFixture } from "./reconciliation"
import { retentionFixtureCleanup, retentionFixtureSetup } from "./retention"
import { ChannelScenario } from "./social"

function drainFixtureInbox() {
  return drainSocialInbox((event, workspaceId) =>
    Effect.gen(function* () {
      const core = yield* CoreDb
      const jobs = yield* JobService
      const channels = yield* core.listChannels(workspaceId)

      const affected = new Set(
        channels
          .filter(
            (channel) =>
              channel.platform === event.provider &&
              event.accountIds.includes(channel.accountId),
          )
          .map((channel) => channel.id),
      )

      const pending = yield* core.listPosts(workspaceId, "queue")
      yield* Effect.forEach(
        pending.filter(
          (post) =>
            post.state === "pending" &&
            post.deliveries.some((delivery) =>
              affected.has(delivery.channelId),
            ),
        ),
        (post) =>
          jobs.handle({ type: "reconcile", workspaceId, postId: post.id }),
        { concurrency: 1, discard: true },
      )
    }),
  )
}

export function fixtureRequest(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname

    if (!path.startsWith("/__fixtures/")) return null

    if (config.APP_ORIGIN !== "http://localhost:3200")
      return yield* Effect.fail(fixtureError("Fixture origin denied"))
    const resources = yield* WorkerResources

    if (path === "/__fixtures/ready" && request.method === "GET") {
      yield* verifyLocalFixtureDatabase(resources.DB, config.APP_ORIGIN)

      return Response.json({ ready: true })
    }

    if (path === "/__fixtures/session" && request.method === "POST")
      return yield* fixtureSignIn(request, config)

    if (path === "/__fixtures/webhook" && request.method === "POST") {
      const response = yield* socialWebhook(
        new Request(`${config.APP_ORIGIN}/webhooks/facebook`, request),
        { ...config, FACEBOOK_CLIENT_SECRET: "isolated-e2e-webhook-key" },
      )

      yield* drainFixtureInbox()

      return response
    }

    if (
      [
        "/__fixtures/deletion/verify",
        "/__fixtures/deletion/unchanged",
      ].includes(path) &&
      request.method === "POST"
    )
      return yield* deletionFixtureVerify(request, config)

    if (
      path === "/__fixtures/deletion/legacy-other-retained" &&
      request.method === "POST"
    )
      return yield* deletionLegacyOtherFixture(request, config)
    const auth = yield* AuthSession

    if (path === "/__fixtures/auth-fault" && request.method === "POST") {
      const { fault } = yield* fixtureJson(
        request,
        Schema.Struct({ fault: Schema.Literals(["upstream", "storage"]) }),
      )

      const headers = new Headers(request.headers)
      headers.set("x-fixture-auth-fault", fault)
      yield* auth.authenticate(new Request(request.url, { headers }))

      return yield* fixtureError("Authentication fault was not raised")
    }

    const session = yield* auth.authenticate(request)

    if (!session.user) return new Response(null, { status: 401 })
    const core = yield* CoreDb
    const workspaces = yield* core.listWorkspaces(session.user.id)
    const hint = new URL(request.url).searchParams.get("workspace")

    const workspace = hint
      ? workspaces.find((value) => value.id === hint)
      : (workspaces.find((value) => value.role === "editor") ?? workspaces[0])

    if (!workspace)
      return yield* Effect.fail(fixtureError("Fixture workspace missing"))
    const userId = session.user.id
    const workspaceId = workspace.id

    if (
      [
        "/__fixtures/deletion/remote",
        "/__fixtures/deletion/remote-unchanged",
        "/__fixtures/deletion/remote-resolve",
      ].includes(path) &&
      request.method === "POST"
    )
      return yield* deletionRemoteFixture(
        request,
        config,
        session.user,
        workspaceId,
      )

    if (
      path === "/__fixtures/deletion/legacy-other" &&
      request.method === "POST"
    )
      return yield* deletionLegacyOtherFixture(request, config, session.user)

    if (path === "/__fixtures/retention/setup" && request.method === "POST")
      return yield* retentionFixtureSetup(request, userId, workspaceId)

    if (path === "/__fixtures/retention/cleanup" && request.method === "POST")
      return yield* retentionFixtureCleanup(request, userId, workspaceId)

    if (path === "/__fixtures/ownership/guards" && request.method === "POST")
      return yield* ownershipFixtureGuards(config, session.user)

    if (path === "/__fixtures/reconciliation" && request.method === "POST")
      return yield* reconciliationFixture(request, userId, workspaceId)
    const connections = yield* fixtureConnections()

    if (
      [
        "/__fixtures/deletion/hold",
        "/__fixtures/deletion/release",
        "/__fixtures/deletion/recover",
        "/__fixtures/deletion/status",
      ].includes(path) &&
      request.method === "POST"
    )
      return yield* deletionGateFixture(request, userId, workspaceId)

    if (
      path === "/__fixtures/deletion/race-invite" &&
      request.method === "POST"
    )
      return yield* deletionInvitationRace(config, session.user, workspaceId)

    if (path === "/__fixtures/deletion/freeze" && request.method === "POST") {
      const deletion = yield* DeletionDb
      yield* deletion.begin(userId)

      return Response.json({ fenced: true })
    }

    if (path === "/__fixtures/deletion/legacy" && request.method === "POST") {
      const social = yield* SocialDb
      yield* social.claimIdempotency(
        JSON.stringify(["credential-ready", "posts.publish"]),
        `deletion-fixture:${userId}`,
        "fixture",
        [],
      )

      return Response.json({ legacy: true })
    }

    if (path === "/__fixtures/deletion/setup" && request.method === "POST")
      return yield* deletionFixtureSetup(
        request,
        config,
        session.user,
        workspaceId,
      )

    if (path === "/__fixtures/channels" && request.method === "POST") {
      const { scenario } = yield* fixtureJson(request, ChannelScenario)

      const platforms = Match.value(scenario).pipe(
        Match.when("mixed", () => ["x", "threads", "bluesky"] as const),
        Match.when("video-required", () => ["youtube"] as const),
        Match.when("tiktok", () => ["tiktok"] as const),
        Match.when("facebook", () => ["facebook"] as const),
        Match.when("editor-shared-account", () => ["x"] as const),
        Match.orElse(() => ["x", "facebook"] as const),
      )

      if (
        scenario === "editor-shared-account" &&
        (workspace.role !== "editor" ||
          workspace.name !== "Shared Editor Workspace")
      )
        return yield* Effect.fail(
          fixtureError("Shared editor workspace required"),
        )

      const connectingUser =
        scenario === "editor-shared-account"
          ? (yield* core.automationPrincipal(workspaceId)).id
          : userId

      for (const platform of platforms) {
        const displayName = Match.value(platform).pipe(
          Match.when("tiktok", () => "TikTok Creator"),
          Match.when("youtube", () => "Alex on YouTube"),
          Match.when("x", () => "Alex on X"),
          Match.orElse(
            (value) => `Alex on ${value[0]?.toUpperCase()}${value.slice(1)}`,
          ),
        )

        const started = yield* connections.begin(
          connectingUser,
          workspaceId,
          platform,
          scenario,
          displayName,
        )

        const discovered = yield* connections.discover(
          connectingUser,
          workspaceId,
          started.attempt.id,
          started.attempt.state,
          displayName,
        )

        yield* connections.select(
          connectingUser,
          workspaceId,
          started.attempt.id,
          discovered.map((account) => account.ref.accountId),
        )
      }

      return Response.json({ channels: yield* core.listChannels(workspaceId) })
    }

    if (path === "/__fixtures/connection/begin" && request.method === "POST") {
      const started = yield* connections.begin(userId, workspaceId, "x")

      return Response.json({
        id: started.attempt.id,
        state: started.attempt.state,
      })
    }

    if (
      path === "/__fixtures/connection/discover" &&
      request.method === "POST"
    ) {
      const input = yield* fixtureJson(
        request,
        Schema.Struct({ id: Schema.String, state: Schema.String }),
      )

      return Response.json(
        yield* connections.discover(userId, workspaceId, input.id, input.state),
      )
    }

    if (path === "/__fixtures/connection/select" && request.method === "POST") {
      const input = yield* fixtureJson(
        request,
        Schema.Struct({ id: Schema.String, accountId: Schema.String }),
      )

      return Response.json(
        yield* connections.select(userId, workspaceId, input.id, [
          input.accountId,
        ]),
      )
    }

    if (path === "/__fixtures/queue-delivery" && request.method === "POST") {
      const input = yield* fixtureJson(
        request,
        Schema.Struct({
          duplicate: Schema.Boolean,
          scenario: Schema.Literal("unknown"),
        }),
      )

      const started = yield* connections.begin(
        userId,
        workspaceId,
        "x",
        input.scenario,
      )

      yield* connections.discover(
        userId,
        workspaceId,
        started.attempt.id,
        started.attempt.state,
      )
      yield* connections.select(userId, workspaceId, started.attempt.id, [
        "fixture-x",
      ])

      const channel = (yield* core.listChannels(workspaceId)).find(
        (value) => value.platform === "x",
      )

      if (!channel)
        return yield* Effect.fail(fixtureError("Fixture queue channel missing"))

      const post = yield* core.savePost(
        workspaceId,
        {
          text: "Queue fixture",
          channelIds: [channel.id],
          mediaIds: [],
          overrides: [],
        },
        null,
      )

      const jobs = yield* JobService

      const message = {
        type: "publish" as const,
        workspaceId,
        postId: post.id,
        operationKey: `fixture:${post.id}`,
      }

      yield* Effect.tryPromise({
        try: () => resources.JOBS.send(message),
        catch: () => fixtureError("Fixture queue send failed"),
      })
      yield* jobs.handle(message)

      if (input.duplicate) yield* jobs.handle(message)
      yield* jobs.handle({ type: "reconcile", workspaceId, postId: post.id })
      const saved = yield* core.getPost(workspaceId, post.id)
      const stats = yield* fixtureDatabaseStats(resources.DB, workspaceId)

      return Response.json({
        dispatches: stats.dispatches,
        state: saved.deliveries[0]?.state ?? "not-submitted",
      })
    }

    if (path === "/__fixtures/inbox" && request.method === "GET")
      yield* drainFixtureInbox()
    const stats = yield* fixtureDatabaseStats(resources.DB, workspaceId)

    if (path === "/__fixtures/grants")
      return Response.json({ count: stats.grants })

    if (path === "/__fixtures/connection/stats")
      return Response.json({
        codeExchanges: stats.codeExchanges,
        grants: stats.grants,
      })

    if (path === "/__fixtures/inbox")
      return Response.json({
        processed: stats.processed,
        quarantined: stats.quarantined,
      })

    return Response.json({ error: "Fixture route not found" }, { status: 404 })
  })
}
