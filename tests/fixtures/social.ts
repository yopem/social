import type {
  DeliveryOutcome,
  PublishTarget,
  SocialAdapter,
} from "@opencoredev/social-sdk"

import { connectedAccountRef, createSocial } from "@opencoredev/social-sdk"
import { mockBackend } from "@opencoredev/social-sdk/testing"
import { tiktok } from "@opencoredev/social-sdk/tiktok"
import { Effect, Layer, Schema } from "effect"
import {
  credentialKey,
  OutcomeSchema,
  makeSdkStores,
} from "server/features/channels/sdk-stores"
import {
  SocialService,
  reconcileOutcomes,
} from "server/features/channels/service"

import { CredentialCrypto } from "auth/services/crypto"
import { CredentialSchema } from "db/schema/channels/social"
import { ChannelsDb } from "db/services/channels"
import { SocialDb } from "db/services/channels/social"
import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import { Analytics } from "rpc/contracts/analytics"
import type { Channel } from "rpc/contracts/channels"
import { Platform } from "rpc/contracts/channels"
import { DiscoveredAccount } from "rpc/contracts/channels"
import type { Media } from "rpc/contracts/media"
import type { Delivery, Post } from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"
import { JsonObject } from "rpc/lib/json"

import { fixtureError } from "./auth"
import { fixtureConnections, fixtureRedirect, fixtureSdk } from "./connections"

const Scenario = Schema.Literals([
  "mixed",
  "success",
  "video-required",
  "tiktok",
  "unknown",
  "facebook",
  "editor-shared-account",
])

export const ChannelScenario = Schema.Struct({ scenario: Scenario })

function scenarioFor(channel: Channel) {
  return Schema.decodeUnknownEffect(Scenario)(
    channel.backend.split(":")[1],
  ).pipe(
    Effect.mapError(() => fixtureError("Invalid fixture channel scenario")),
  )
}

export function fixtureSocialLayer(_config: AppConfig) {
  return Layer.effect(
    SocialService,
    Effect.gen(function* () {
      const workspacesDb = yield* WorkspacesDb
      const channelsDb = yield* ChannelsDb
      const postsDb = yield* PostsDb
      const db = yield* SocialDb
      const connections = yield* fixtureConnections()
      const cipher = yield* CredentialCrypto

      function creator(userId: string, workspaceId: string, channelId: string) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({ userId, workspaceId })
          const channel = yield* channelsDb.channel({ workspaceId, channelId })

          if (channel.platform !== "tiktok")
            return yield* Effect.fail(fixtureError("TikTok channel required"))
          yield* requireGrant(userId, workspaceId, channel, "posts.publish")

          const stored = yield* db.credential(
            credentialKey(
              workspaceId,
              channel.backend,
              channel.platform,
              channel.accountId,
            ),
          )

          if (!stored)
            return yield* Effect.fail(
              fixtureError("Fixture credential missing"),
            )

          const credential = yield* cipher.decrypt(stored.ciphertext).pipe(
            Effect.flatMap(
              Schema.decodeUnknownEffect(
                Schema.fromJsonString(CredentialSchema),
              ),
            ),
            Effect.mapError(() => fixtureError("Invalid fixture credential")),
          )

          const adapter = tiktok({
            auth: {
              openId: channel.accountId,
              accessToken: credential.accessToken,
            },
            verifiedMediaOrigins: ["https://fixtures.example.test"],
            fetch(input) {
              const url =
                input instanceof Request ? input.url : input.toString()

              if (
                url !==
                "https://open.tiktokapis.com/v2/post/publish/creator_info/query/"
              )
                return connections.stores.bridge(
                  Effect.fail(fixtureError("Fixture TikTok request denied")),
                )

              return connections.stores.bridge(
                Effect.succeed(
                  Response.json({
                    data: {
                      creator_avatar_url:
                        "https://fixtures.example.test/avatar.png",
                      creator_username: "fixture.creator",
                      creator_nickname: "TikTok Creator",
                      privacy_level_options: [
                        "SELF_ONLY",
                        "PUBLIC_TO_EVERYONE",
                      ],
                      comment_disabled: false,
                      duet_disabled: false,
                      stitch_disabled: false,
                      max_video_post_duration_sec: 180,
                    },
                    error: { code: "ok", message: "", log_id: "fixture" },
                  }),
                ),
              )
            },
          })

          const native = adapter.native

          if (!native)
            return yield* Effect.fail(fixtureError("TikTok native API missing"))

          return yield* fixtureSdk(() =>
            native.creatorInfo(connectedAccountRef(channel), {
              backendInstance: channel.backend,
              correlationId: crypto.randomUUID(),
              authorization: { principalId: userId, tenantId: workspaceId },
              retryBudget: { maxAttempts: 1, maxElapsedMs: 10000 },
            }),
          ).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(JsonObject)),
            Effect.mapError(() =>
              fixtureError("Invalid fixture creator information"),
            ),
          )
        })
      }

      function requireGrant(
        userId: string,
        workspaceId: string,
        channel: Channel,
        operation: string,
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({ userId, workspaceId })

          if (
            channel.workspaceId !== workspaceId ||
            channel.status !== "connected"
          )
            return yield* Effect.fail(
              fixtureError("Channel is not connected in this workspace"),
            )

          const grants = yield* db.grants(
            workspaceId,
            channel.backend,
            channel.platform,
            channel.accountId,
          )

          if (!grants.some((grant) => grant.capabilities.includes(operation)))
            return yield* Effect.fail(
              fixtureError("Durable account grant required"),
            )
        })
      }

      function clientFor(
        userId: string,
        workspaceId: string,
        post: Post,
        channels: readonly Channel[],
        operation: string,
      ) {
        return Effect.gen(function* () {
          const scopedStores = yield* makeSdkStores({
            tenantId: workspaceId,
            principalId: userId,
          })

          const backends: Record<string, SocialAdapter<unknown>> = {}

          for (const channel of channels) {
            yield* requireGrant(userId, workspaceId, channel, operation)
            const scenario = yield* scenarioFor(channel)

            const mock = mockBackend({
              backendInstance: channel.backend,
              scenario:
                scenario === "unknown" ||
                (scenario === "mixed" && channel.platform === "bluesky")
                  ? "provider-state-unknown"
                  : scenario === "mixed" && channel.platform === "threads"
                    ? "media-processing-then-success"
                    : "immediate-text-success",
            })

            const posts = mock.posts

            if (!posts)
              return yield* Effect.fail(fixtureError("Mock publishing missing"))

            const validation =
              channel.platform === "tiktok"
                ? tiktok({
                    auth: {
                      openId: channel.accountId,
                      accessToken: "isolated-fixture-token",
                    },
                    verifiedMediaOrigins: ["https://fixtures.example.test"],
                    fetch() {
                      return connections.stores.bridge(
                        Effect.fail(
                          fixtureError(
                            "Fixture TikTok publishing network denied",
                          ),
                        ),
                      )
                    },
                  }).posts
                : posts

            if (!validation)
              return yield* Effect.fail(
                fixtureError("Fixture platform validation missing"),
              )
            const workflowId = `${workspaceId}:${post.id}:${channel.id}`
            backends[channel.backend] = {
              ...mock,
              posts: {
                ...posts,
                prepareTarget(target) {
                  return validation.prepareTarget(target)
                },
                publishTarget(input, context) {
                  return connections.stores.bridge(
                    Effect.gen(function* () {
                      yield* db.createWorkflow(
                        workflowId,
                        "fixture-dispatch",
                        "{}",
                        { tenantId: workspaceId, principalId: userId },
                      )

                      const outcome = yield* fixtureSdk(() =>
                        posts.publishTarget(input, context),
                      )

                      yield* db.updateWorkflow(
                        workflowId,
                        JSON.stringify(outcome),
                      )

                      return outcome
                    }),
                  )
                },
                getDelivery(ref) {
                  return connections.stores.bridge(
                    Effect.gen(function* () {
                      if (
                        (yield* db.workflow(`${workflowId}:lookup`)) ===
                        "outage"
                      )
                        return yield* Effect.fail(
                          new ApiError({
                            code: "upstream-failure",
                            message:
                              "Fixture provider lookup temporarily unavailable",
                          }),
                        )
                      const saved = yield* db.workflow(workflowId)

                      const outcome = yield* Schema.decodeUnknownEffect(
                        Schema.fromJsonString(OutcomeSchema),
                      )(saved).pipe(
                        Effect.mapError(() =>
                          fixtureError("Fixture delivery missing"),
                        ),
                      )

                      if (
                        outcome.account.backend !== ref.backend ||
                        outcome.account.platform !== ref.platform ||
                        outcome.account.accountId !== ref.accountId ||
                        outcome.delivery?.deliveryId !== ref.deliveryId
                      )
                        return yield* Effect.fail(
                          fixtureError("Fixture delivery account mismatch"),
                        )

                      return outcome
                    }),
                  )
                },
              },
            }
          }

          return {
            client: createSocial({
              backends,
              authorization: scopedStores.authorization,
              idempotencyStore: scopedStores.idempotency,
            }),
          }
        })
      }

      function saveOutcomes(
        post: Post,
        channels: readonly Channel[],
        outcomes: readonly DeliveryOutcome[],
      ) {
        return Effect.forEach(
          outcomes,
          (outcome) =>
            Effect.gen(function* () {
              const channel = channels.find(
                (value) =>
                  value.backend === outcome.account.backend &&
                  value.accountId === outcome.account.accountId &&
                  value.platform === outcome.account.platform,
              )

              if (!channel)
                return yield* Effect.fail(
                  fixtureError("Unknown publication account"),
                )

              const delivery: Delivery = {
                id: `${post.id}:${channel.id}`,
                postId: post.id,
                channelId: channel.id,
                platform: channel.platform,
                state: outcome.state,
                message: outcome.state === "failed" ? outcome.message : null,
                url:
                  outcome.state === "published" ? (outcome.url ?? null) : null,
                providerPostId:
                  outcome.state === "published"
                    ? outcome.post.postId
                    : (outcome.delivery?.deliveryId ?? null),
                observedAt: outcome.observedAt,
                retryDisposition:
                  outcome.state === "unknown" ? "reconcile-first" : null,
              }

              yield* postsDb.saveDelivery(delivery)

              return delivery
            }),
          { concurrency: 1 },
        )
      }

      function prepare(
        userId: string,
        workspaceId: string,
        post: Post,
        media: readonly Media[],
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({ userId, workspaceId })

          if (
            post.workspaceId !== workspaceId ||
            media.some((item) => item.workspaceId !== workspaceId)
          )
            return yield* Effect.fail(fixtureError("Wrong workspace"))

          const channels = yield* Effect.forEach(
            post.content.channelIds,
            (id) => channelsDb.channel({ workspaceId, channelId: id }),
            { concurrency: 1 },
          )

          const { client } = yield* clientFor(
            userId,
            workspaceId,
            post,
            channels,
            "posts.publish",
          )

          // Local R2 URLs use HTTP. Mock provider media uses this fixed HTTPS boundary.
          const targets: PublishTarget[] = []

          for (const channel of channels) {
            const override = post.content.overrides.find(
              (value) => value.channelId === channel.id,
            )

            if (
              channel.platform === "youtube" &&
              !media.some((item) => item.kind === "video")
            )
              return yield* Effect.fail(
                fixtureError("YouTube requires video media."),
              )

            const target: PublishTarget = {
              account: connectedAccountRef(channel),
              content: {
                text: override?.text ?? post.content.text,
                media: media.map((item) => ({
                  kind: item.kind,
                  source: {
                    kind: "https-url",
                    url:
                      item.kind === "video"
                        ? "https://fixtures.example.test/video.mp4"
                        : "https://fixtures.example.test/image.png",
                  },
                  mimeType: item.mediaType,
                })),
              },
            }

            if (channel.platform === "tiktok") {
              if (
                !override?.creatorConsent ||
                !override.privacyLevel ||
                !media.length
              )
                return yield* Effect.fail(
                  fixtureError(
                    "TikTok requires explicit creator consent, privacy, and media",
                  ),
                )

              const settings = yield* Schema.decodeUnknownEffect(
                Schema.Struct({
                  privacyLevel: Schema.Literals([
                    "SELF_ONLY",
                    "MUTUAL_FOLLOW_FRIENDS",
                    "FOLLOWER_OF_CREATOR",
                    "PUBLIC_TO_EVERYONE",
                  ]),
                  creatorInfo: JsonObject,
                  disableComment: Schema.Boolean,
                  disableDuet: Schema.Boolean,
                  disableStitch: Schema.Boolean,
                  brandedContent: Schema.Boolean,
                  ownBrand: Schema.Boolean,
                  aiGenerated: Schema.Boolean,
                  draft: Schema.Boolean,
                }),
              )(override).pipe(
                Effect.mapError(() =>
                  fixtureError(
                    "TikTok requires a creator information preview and explicit interaction, disclosure, AI, and draft choices",
                  ),
                ),
              )

              targets.push({
                ...target,
                options: {
                  privacy: settings.privacyLevel,
                  consentGiven: true,
                  creatorInfo: yield* creator(userId, workspaceId, channel.id),
                  disableComments: settings.disableComment,
                  disableDuet: settings.disableDuet,
                  disableStitch: settings.disableStitch,
                  brandedContent: settings.brandedContent,
                  ownBrand: settings.ownBrand,
                  aiGenerated: settings.aiGenerated,
                  draft: settings.draft,
                },
              })
            } else targets.push(target)
          }

          const request = { targets, content: { text: post.content.text } }

          const plan = yield* Effect.try({
            try: () => client.posts.prepare(request),
            catch: () => fixtureError("Invalid publication"),
          })

          if (!plan.ok)
            return yield* Effect.fail(
              fixtureError(
                plan.issues.map((issue) => issue.message).join("; "),
              ),
            )

          return { channels, client, request }
        })
      }

      return {
        availability() {
          return Effect.succeed(
            Platform.literals.map((platform) => ({
              platform,
              configured: false,
              reason: "Setup required",
            })),
          )
        },
        begin(
          userId: string,
          workspaceId: string,
          platform: typeof Platform.Type,
        ) {
          return connections.begin(userId, workspaceId, platform).pipe(
            Effect.map((result) => ({
              attemptId: result.attempt.id,
              url: result.authorizationUrl,
            })),
          )
        },
        discover(
          userId: string,
          workspaceId: string,
          id: string,
          callbackUrl: string,
        ) {
          return Effect.gen(function* () {
            const url = yield* Effect.try({
              try: () => new URL(callbackUrl),
              catch: () => fixtureError("Invalid fixture callback"),
            })

            if (url.origin + url.pathname !== fixtureRedirect)
              return yield* Effect.fail(fixtureError("Fixture callback denied"))

            const accounts = yield* connections.discover(
              userId,
              workspaceId,
              id,
              url.searchParams.get("state") ?? "",
            )

            return yield* Schema.decodeUnknownEffect(
              Schema.Array(DiscoveredAccount),
            )(
              accounts.map((account) => ({
                accountId: account.ref.accountId,
                platform: account.ref.platform,
                displayName: account.displayName,
              })),
            ).pipe(
              Effect.mapError(() =>
                fixtureError("Invalid discovered accounts"),
              ),
            )
          })
        },
        discovered(userId: string, workspaceId: string, id: string) {
          return Effect.gen(function* () {
            yield* workspacesDb.workspaceAccess({
              userId,
              workspaceId,
              manage: true,
            })
            const row = yield* db.attempt(id)

            if (
              !row ||
              row.tenant_id !== workspaceId ||
              row.principal_id !== userId
            )
              return yield* Effect.fail(
                fixtureError("Connection attempt unavailable"),
              )

            const accounts = yield* fixtureSdk(() =>
              connections.stores.connections.getDiscoveredAccounts(id),
            )

            return yield* Schema.decodeUnknownEffect(
              Schema.Array(DiscoveredAccount),
            )(
              (accounts ?? []).map((account) => ({
                accountId: account.ref.accountId,
                platform: account.ref.platform,
                displayName: account.displayName,
              })),
            ).pipe(
              Effect.mapError(() =>
                fixtureError("Invalid discovered accounts"),
              ),
            )
          })
        },
        select(
          userId: string,
          workspaceId: string,
          id: string,
          ids: readonly string[],
        ) {
          return connections
            .select(userId, workspaceId, id, ids)
            .pipe(Effect.andThen(channelsDb.listChannels(workspaceId)))
        },
        disconnect(userId: string, workspaceId: string, id: string) {
          return Effect.gen(function* () {
            yield* workspacesDb.workspaceAccess({
              userId,
              workspaceId,
              manage: true,
            })

            const channel = yield* channelsDb.channel({
              workspaceId,
              channelId: id,
            })

            yield* db.revoke(
              workspaceId,
              channel.backend,
              channel.platform,
              channel.accountId,
            )
            yield* db.deleteCredential(
              credentialKey(
                workspaceId,
                channel.backend,
                channel.platform,
                channel.accountId,
              ),
            )
            yield* channelsDb.disconnectChannel({ workspaceId, channelId: id })
          })
        },
        prepare(
          userId: string,
          workspaceId: string,
          post: Post,
          media: readonly Media[],
        ) {
          return prepare(userId, workspaceId, post, media).pipe(Effect.asVoid)
        },
        publish(
          userId: string,
          workspaceId: string,
          post: Post,
          media: readonly Media[],
          key: string,
        ) {
          return Effect.gen(function* () {
            const prepared = yield* prepare(userId, workspaceId, post, media)

            const result = yield* fixtureSdk(() =>
              prepared.client.posts.publish(
                { ...prepared.request, idempotencyKey: `${post.id}:${key}` },
                {
                  authorization: { tenantId: workspaceId, principalId: userId },
                  retryBudget: { maxAttempts: 1, maxElapsedMs: 10000 },
                },
              ),
            )

            return yield* saveOutcomes(post, prepared.channels, result.outcomes)
          })
        },
        analytics(userId: string, workspaceId: string) {
          return Effect.gen(function* () {
            yield* workspacesDb.workspaceAccess({ userId, workspaceId })
            const channels = yield* channelsDb.listChannels(workspaceId)

            const posts = yield* postsDb.listPosts({
              workspaceId,
              filter: "sent",
            })

            return yield* Schema.decodeUnknownEffect(Analytics)({
              channels: channels.map((channel) => ({
                channelId: channel.id,
                platform: channel.platform,
                available: false,
                reason: "Fixture account analytics unavailable",
                metrics: [],
              })),
              posts: posts.flatMap((post) =>
                post.deliveries
                  .filter((delivery) => delivery.state === "published")
                  .map((delivery) => ({
                    postId: post.id,
                    channelId: delivery.channelId,
                    available: false,
                    reason: "Fixture post analytics unavailable",
                    metrics: [],
                  })),
              ),
            }).pipe(
              Effect.mapError(() => fixtureError("Invalid fixture analytics")),
            )
          })
        },
        reconcile(userId: string, workspaceId: string, post: Post) {
          return Effect.gen(function* () {
            yield* workspacesDb.workspaceAccess({ userId, workspaceId })

            if (post.workspaceId !== workspaceId)
              return yield* Effect.fail(fixtureError("Wrong workspace"))

            const channels = yield* Effect.forEach(
              post.content.channelIds,
              (id) => channelsDb.channel({ workspaceId, channelId: id }),
              { concurrency: 1 },
            )

            const { client } = yield* clientFor(
              userId,
              workspaceId,
              post,
              channels,
              "posts.read",
            )

            const outcomes = yield* reconcileOutcomes(
              userId,
              workspaceId,
              post,
              channels,
              client,
            )

            const updated = yield* saveOutcomes(post, channels, outcomes)

            return post.deliveries.map(
              (delivery) =>
                updated.find(
                  (value) => value.channelId === delivery.channelId,
                ) ?? delivery,
            )
          })
        },
        tiktokCreatorInfo: creator,
      }
    }),
  )
}
