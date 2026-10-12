import type { BackendRegistry, PublishTarget } from "@opencoredev/social-sdk"
import type { AppConfig } from "env/server"
import type { Channel, Delivery, Media, Post } from "rpc/contracts/models"

import { connectedAccountRef, createSocial } from "@opencoredev/social-sdk"
import { mockBackend } from "@opencoredev/social-sdk/testing"
import { tiktok } from "@opencoredev/social-sdk/tiktok"
import { CoreDb } from "db/services/core"
import { SocialDb } from "db/services/social"
import { Effect, Layer, Schema } from "effect"
import { Analytics, Platform } from "rpc/contracts/models"
import { SocialService } from "server/services/social"

import { fixtureError } from "./auth"
import { fixtureConnections, fixtureSdk } from "./connections"

const Scenario = Schema.Literal("mixed", "success", "video-required", "tiktok", "unknown")
export const ChannelScenario = Schema.Struct({ scenario: Scenario })

function scenarioFor(channel: Channel) {
  return Schema.decodeUnknown(Scenario)(channel.backend.split(":")[1]).pipe(Effect.mapError(() => fixtureError("Invalid fixture channel scenario")))
}

export function fixtureSocialLayer(_config: AppConfig) {
  return Layer.effect(SocialService, Effect.gen(function* () {
    const core = yield* CoreDb
    const db = yield* SocialDb
    const connections = yield* fixtureConnections()

    function creator(userId: string, workspaceId: string, channelId: string) {
      return Effect.gen(function* () {
        yield* core.workspaceAccess(userId, workspaceId)
        const channel = yield* core.channel(workspaceId, channelId)
        if (channel.platform !== "tiktok") return yield* Effect.fail(fixtureError("TikTok channel required"))
        const adapter = tiktok({ auth: { openId: channel.accountId, accessToken: "fixture" }, fetch() {
          return connections.stores.bridge(Effect.succeed(Response.json({ data: { creator_avatar_url: "https://fixtures.example.test/avatar.png", creator_username: "fixture.creator", creator_nickname: "TikTok Creator", privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"], comment_disabled: false, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 180 }, error: { code: "ok", message: "", log_id: "fixture" } })))
        } })
        if (!adapter.native) return yield* Effect.fail(fixtureError("TikTok native API missing"))
        return yield* fixtureSdk(() => adapter.native!.creatorInfo(connectedAccountRef(channel), { backendInstance: channel.backend, correlationId: crypto.randomUUID(), authorization: { principalId: userId, tenantId: workspaceId } }))
      })
    }

    function prepare(userId: string, workspaceId: string, post: Post, media: readonly Media[]) {
      return Effect.gen(function* () {
        yield* core.workspaceAccess(userId, workspaceId)
        if (post.workspaceId !== workspaceId || media.some((item) => item.workspaceId !== workspaceId)) return yield* Effect.fail(fixtureError("Wrong workspace"))
        const channels = yield* Effect.forEach(post.content.channelIds, (id) => core.channel(workspaceId, id), { concurrency: 1 })
        const backends: BackendRegistry = {}
        const targets: PublishTarget[] = []
        for (const channel of channels) {
          const scenario = yield* scenarioFor(channel)
          const mock = mockBackend({ backendInstance: channel.backend, scenario: scenario === "unknown" || (scenario === "mixed" && channel.platform === "bluesky") ? "provider-state-unknown" : scenario === "mixed" && channel.platform === "threads" ? "media-processing-then-success" : "immediate-text-success" })
          const publish = mock.posts?.publish
          backends[channel.backend] = { ...mock, posts: { ...mock.posts, publish(input, context) {
            return connections.stores.bridge(Effect.gen(function* () {
              yield* db.createWorkflow(`${workspaceId}:${post.id}:${channel.id}`, "fixture-dispatch", "{}")
              if (!publish) return yield* Effect.fail(fixtureError("Mock publishing missing"))
              return yield* fixtureSdk(() => publish(input, context))
            }))
          } } }
          const override = post.content.overrides.find((value) => value.channelId === channel.id)
          if (channel.platform === "youtube" && !media.some((item) => item.kind === "video")) return yield* Effect.fail(fixtureError("YouTube requires video media."))
          if (channel.platform === "tiktok" && (!override?.creatorConsent || !override.privacyLevel || !media.length)) return yield* Effect.fail(fixtureError("TikTok requires explicit creator consent, privacy, and media"))
          targets.push({ account: connectedAccountRef(channel), content: { text: override?.text ?? post.content.text, media: media.map((item) => ({ kind: item.kind, source: { kind: "https-url", url: item.url }, mimeType: item.mediaType })) } })
        }
        const client = createSocial({ backends, authorization: connections.stores.authorization, idempotencyStore: connections.stores.idempotency })
        const request = { targets, content: { text: post.content.text } }
        const plan = yield* Effect.try({ try: () => client.posts.prepare(request), catch: () => fixtureError("Invalid publication") })
        if (!plan.ok) return yield* Effect.fail(fixtureError(plan.issues.map((issue) => issue.message).join("; ")))
        return { channels, client, request }
      })
    }

    return {
      availability() { return Effect.succeed(Platform.literals.map((platform) => ({ platform, configured: false, reason: "Setup required" }))) },
      begin(userId: string, workspaceId: string, platform: typeof Platform.Type) { return connections.begin(userId, workspaceId, platform).pipe(Effect.map((result) => ({ attemptId: result.attempt.id, url: result.authorizationUrl }))) },
      discover(userId: string, workspaceId: string, id: string, callbackUrl: string) { return connections.discover(userId, workspaceId, id, new URL(callbackUrl).searchParams.get("state") ?? "").pipe(Effect.map((accounts) => accounts.map((account) => ({ accountId: account.ref.accountId, platform: account.ref.platform, displayName: account.displayName })))) },
      discovered(userId: string, workspaceId: string, id: string) { return core.workspaceAccess(userId, workspaceId, true).pipe(Effect.zipRight(fixtureSdk(() => connections.stores.connections.getDiscoveredAccounts(id))), Effect.map((accounts) => (accounts ?? []).map((account) => ({ accountId: account.ref.accountId, platform: account.ref.platform, displayName: account.displayName })))) },
      select(userId: string, workspaceId: string, id: string, ids: readonly string[]) { return connections.select(userId, workspaceId, id, ids).pipe(Effect.zipRight(core.listChannels(workspaceId))) },
      disconnect(userId: string, workspaceId: string, id: string) { return Effect.gen(function* () { yield* core.workspaceAccess(userId, workspaceId, true); const channel = yield* core.channel(workspaceId, id); yield* db.revoke(workspaceId, channel.backend, channel.platform, channel.accountId); yield* core.disconnectChannel(workspaceId, id) }) },
      prepare(userId: string, workspaceId: string, post: Post, media: readonly Media[]) { return prepare(userId, workspaceId, post, media).pipe(Effect.asVoid) },
      publish(userId: string, workspaceId: string, post: Post, media: readonly Media[], key: string) { return Effect.gen(function* () {
        const prepared = yield* prepare(userId, workspaceId, post, media)
        const result = yield* fixtureSdk(() => prepared.client.posts.publish({ ...prepared.request, idempotencyKey: `${post.id}:${key}` }, { authorization: { tenantId: workspaceId, principalId: userId }, retryBudget: { maxAttempts: 1, maxElapsedMs: 10000 } }))
        return yield* Effect.forEach(result.outcomes, (outcome) => Effect.gen(function* () {
          const channel = prepared.channels.find((value) => value.backend === outcome.account.backend && value.accountId === outcome.account.accountId)
          if (!channel) return yield* Effect.fail(fixtureError("Unknown publication account"))
          const delivery: Delivery = { id: `${post.id}:${channel.id}`, postId: post.id, channelId: channel.id, platform: channel.platform, state: outcome.state, message: outcome.state === "failed" ? outcome.message : null, url: outcome.state === "published" ? outcome.url ?? null : null, providerPostId: outcome.state === "published" ? outcome.post.postId : outcome.delivery?.deliveryId ?? null, observedAt: outcome.observedAt, retryDisposition: outcome.state === "unknown" ? "reconcile-first" : null }
          yield* core.saveDelivery(delivery)
          return delivery
        }), { concurrency: 1 })
      }) },
      analytics(userId: string, workspaceId: string) { return core.workspaceAccess(userId, workspaceId).pipe(Effect.as(Schema.decodeSync(Analytics)({ channels: [], posts: [] }))) },
      reconcile(userId: string, workspaceId: string, post: Post) { return core.workspaceAccess(userId, workspaceId).pipe(Effect.as(post.deliveries)) },
      tiktokCreatorInfo: creator,
    }
  }))
}
