import type {
  BackendRegistry,
  DeliveryOutcome,
  MediaAttachment,
  OperationName,
  SocialAdapter,
} from "@opencoredev/social-sdk"
import type {
  ConnectionProvider,
  OAuthCredentialSink,
  OAuthProviderOptions,
  StoredCredential,
} from "@opencoredev/social-sdk/server"

import { connectedAccountRef, createSocial } from "@opencoredev/social-sdk"
import { bluesky } from "@opencoredev/social-sdk/bluesky"
import { instagram } from "@opencoredev/social-sdk/instagram"
import { linkedin } from "@opencoredev/social-sdk/linkedin"
import {
  CredentialManager,
  blueskyOAuth,
  blueskyOAuthClientMetadata,
  blueskyOAuthTransport,
  parseBlueskyOAuthSession,
  refreshBlueskyOAuthSession,
  refreshOAuthToken,
  xOAuth,
  threadsOAuth,
  youtubeOAuth,
  tiktokOAuth,
  instagramOAuth,
  linkedinOAuth,
} from "@opencoredev/social-sdk/server"
import { threads } from "@opencoredev/social-sdk/threads"
import { tiktok } from "@opencoredev/social-sdk/tiktok"
import { x } from "@opencoredev/social-sdk/x"
import { youtube } from "@opencoredev/social-sdk/youtube"
import { Context, DateTime, Effect, Layer, Match, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http"
import { OperationGate } from "server/features/accounts/operation-gate"
import { makeChannelAnalytics } from "server/features/channels/analytics"
import { makeConnectionOperations } from "server/features/channels/connections"
import {
  facebookAdapter,
  facebookProvider,
} from "server/features/channels/facebook"
import { preparePublicationTargets } from "server/features/channels/publication-targets"
import { sdkError, sdkRequest } from "server/features/channels/sdk-request"
import {
  credentialKey,
  makeSdkStores,
  pendingCredentialKey,
} from "server/features/channels/sdk-stores"
import { readBounded } from "server/platform/egress"

import { CredentialCrypto } from "auth/services/crypto"
import { CredentialSchema } from "db/schema/channels/social"
import { ChannelsDb } from "db/services/channels"
import { SocialDb } from "db/services/channels/social"
import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import type { Channel, PlatformAvailability } from "rpc/contracts/channels"
import { Platform } from "rpc/contracts/channels"
import type { Media } from "rpc/contracts/media"
import type { Delivery, Post } from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"
import { JsonValueSchema } from "rpc/lib/json"

export function reconcileOutcomes(
  userId: string,
  workspaceId: string,
  post: Post,
  channels: readonly Channel[],
  client: Pick<ReturnType<typeof createSocial>, "posts">,
) {
  return Effect.gen(function* () {
    const outcomes: DeliveryOutcome[] = []

    for (const delivery of post.deliveries) {
      if (
        !delivery.providerPostId ||
        !["unknown", "processing", "accepted", "scheduled"].includes(
          delivery.state,
        )
      )
        continue
      const channel = channels.find((item) => item.id === delivery.channelId)

      if (!channel)
        return yield* Effect.fail(
          new ApiError({
            code: "storage-failure",
            message: "Delivery channel unavailable",
          }),
        )
      outcomes.push(
        yield* sdkRequest((signal) =>
          client.posts.getDelivery(
            {
              kind: "delivery",
              version: 1,
              backend: channel.backend,
              platform: channel.platform,
              accountId: channel.accountId,
              deliveryId: delivery.providerPostId ?? "",
            },
            {
              signal,
              authorization: { principalId: userId, tenantId: workspaceId },
            },
          ),
        ),
      )
    }

    return outcomes
  })
}

export function platformAvailability(
  config: AppConfig,
): readonly (typeof PlatformAvailability.Type)[] {
  return Platform.literals.map((platform) => {
    const prefix = platform.toUpperCase()

    const credentials = {
      X_CLIENT_ID: config.X_CLIENT_ID,
      X_CLIENT_SECRET: config.X_CLIENT_SECRET,
      THREADS_CLIENT_ID: config.THREADS_CLIENT_ID,
      THREADS_CLIENT_SECRET: config.THREADS_CLIENT_SECRET,
      BLUESKY_CLIENT_ID: config.BLUESKY_CLIENT_ID,
      YOUTUBE_CLIENT_ID: config.YOUTUBE_CLIENT_ID,
      YOUTUBE_CLIENT_SECRET: config.YOUTUBE_CLIENT_SECRET,
      TIKTOK_CLIENT_ID: config.TIKTOK_CLIENT_ID,
      TIKTOK_CLIENT_SECRET: config.TIKTOK_CLIENT_SECRET,
      INSTAGRAM_CLIENT_ID: config.INSTAGRAM_CLIENT_ID,
      INSTAGRAM_CLIENT_SECRET: config.INSTAGRAM_CLIENT_SECRET,
      LINKEDIN_CLIENT_ID: config.LINKEDIN_CLIENT_ID,
      LINKEDIN_CLIENT_SECRET: config.LINKEDIN_CLIENT_SECRET,
      FACEBOOK_CLIENT_ID: config.FACEBOOK_CLIENT_ID,
      FACEBOOK_CLIENT_SECRET: config.FACEBOOK_CLIENT_SECRET,
    }

    const id = `${prefix}_CLIENT_ID`
    const secret = `${prefix}_CLIENT_SECRET`

    const missing = Object.entries(credentials).flatMap(([key, value]) =>
      (key === id || (platform !== "bluesky" && key === secret)) && !value
        ? [key]
        : [],
    )

    if (platform === "linkedin" && !config.LINKEDIN_API_VERSION)
      missing.push("LINKEDIN_API_VERSION")

    if (platform === "tiktok" && !config.TIKTOK_VERIFIED_MEDIA_ORIGINS.length)
      missing.push("TIKTOK_VERIFIED_MEDIA_ORIGINS")

    return {
      platform,
      configured: !missing.length,
      reason: missing.length ? `Setup required: ${missing.join(", ")}` : null,
    }
  })
}

function dnsTxt(hostname: string) {
  return Effect.gen(function* () {
    const client = yield* HttpClient.HttpClient

    const response = yield* client
      .get("https://cloudflare-dns.com/dns-query", {
        urlParams: { name: hostname, type: "TXT" },
        headers: { accept: "application/dns-json" },
      })
      .pipe(Effect.flatMap(HttpClientResponse.filterStatusOk))

    const bytes = yield* readBounded(response, 65536)

    const result = yield* Schema.decodeUnknownEffect(
      Schema.fromJsonString(
        Schema.Struct({
          Status: Schema.Literal(0),
          Answer: Schema.optional(
            Schema.Array(
              Schema.Struct({ type: Schema.Number, data: Schema.String }),
            ),
          ),
        }),
      ),
    )(new TextDecoder().decode(bytes))

    return (result.Answer ?? []).flatMap((answer) =>
      answer.type === 16 ? [[answer.data.replace(/^"|"$/g, "")]] : [],
    )
  }).pipe(
    Effect.scoped,
    Effect.provide(FetchHttpClient.layer),
    Effect.mapError(sdkError),
  )
}

export function blueskyMetadata(config: AppConfig) {
  return Effect.try({
    try: () =>
      blueskyOAuthClientMetadata({
        clientId:
          config.BLUESKY_CLIENT_ID ??
          `${config.APP_ORIGIN}/social/bluesky/client-metadata.json`,
        redirectUris: [`${config.APP_ORIGIN}/social/callback/bluesky`],
        scope: "atproto transition:generic",
        clientName: "Social Poster",
        clientUri: config.APP_ORIGIN,
      }),
    catch: sdkError,
  })
}

function makeSocial(config: AppConfig) {
  return Effect.gen(function* () {
    const channelsDb = yield* ChannelsDb
    const workspacesDb = yield* WorkspacesDb
    const postsDb = yield* PostsDb
    const gate = yield* OperationGate
    const db = yield* SocialDb
    const encryption = yield* CredentialCrypto

    function decodeCredential(data: string) {
      return Schema.decodeUnknownEffect(
        Schema.fromJsonString(CredentialSchema),
      )(data).pipe(
        Effect.mapError(
          () =>
            new ApiError({
              code: "storage-failure",
              message: "Stored credential is invalid",
            }),
        ),
      )
    }

    function requirePlatform(platform: Platform) {
      const available = platformAvailability(config).find(
        (item) => item.platform === platform,
      )

      return available?.configured
        ? Effect.void
        : Effect.fail(
            new ApiError({
              code: "not-configured",
              message: available?.reason ?? "Platform is not configured",
            }),
          )
    }

    function provider(
      platform: Platform,
      stores: Effect.Success<ReturnType<typeof makeSdkStores>>,
    ): ConnectionProvider {
      const sink: OAuthCredentialSink = {
        save(input) {
          return stores.bridge(
            Effect.gen(function* () {
              const key = pendingCredentialKey(
                input.attempt.id,
                input.account.ref.accountId,
              )

              const existing = yield* db.credential(key)

              const ciphertext = yield* encryption.encrypt(
                JSON.stringify(input.token),
              )

              const result = yield* db.casCredential(
                key,
                existing?.revision,
                ciphertext,
              )

              if (!result.updated)
                return yield* Effect.fail(
                  new ApiError({
                    code: "conflict",
                    message: "Credential changed during discovery",
                  }),
                )
            }),
          )
        },
      }

      if (platform === "facebook")
        return facebookProvider(config, sink, stores.bridge)

      if (platform === "bluesky")
        return blueskyOAuth({
          clientId: config.BLUESKY_CLIENT_ID ?? "",
          redirectUri: `${config.APP_ORIGIN}/social/callback/bluesky`,
          fetch,
          resolveTxt: (hostname) => stores.bridge(dnsTxt(hostname)),
          sessionSink: {
            save(input) {
              return stores.bridge(
                Effect.gen(function* () {
                  const key = pendingCredentialKey(
                    input.attempt.id,
                    input.account.ref.accountId,
                  )

                  const existing = yield* db.credential(key)

                  const value: StoredCredential = {
                    accessToken: input.session.accessToken,
                    expiresAt: input.session.expiresAt,
                    metadata: { session: JSON.stringify(input.session) },
                  }

                  const ciphertext = yield* encryption.encrypt(
                    JSON.stringify(value),
                  )

                  const result = yield* db.casCredential(
                    key,
                    existing?.revision,
                    ciphertext,
                  )

                  if (!result.updated)
                    return yield* Effect.fail(
                      new ApiError({
                        code: "conflict",
                        message: "Bluesky session changed during discovery",
                      }),
                    )
                }),
              )
            },
          },
        })
      const options = oauthOptions(platform, sink)

      switch (platform) {
        case "x":
          return xOAuth(options)
        case "threads":
          return threadsOAuth(options)
        case "youtube":
          return youtubeOAuth(options)
        case "tiktok":
          return tiktokOAuth(options)
        case "instagram":
          return instagramOAuth(options)
        case "linkedin":
          return linkedinOAuth(options)
      }
    }

    function oauthOptions(
      platform: Exclude<Platform, "bluesky" | "facebook">,
      sink?: OAuthCredentialSink,
    ): OAuthProviderOptions {
      const credentials = {
        x: [config.X_CLIENT_ID, config.X_CLIENT_SECRET],
        threads: [config.THREADS_CLIENT_ID, config.THREADS_CLIENT_SECRET],
        youtube: [config.YOUTUBE_CLIENT_ID, config.YOUTUBE_CLIENT_SECRET],
        tiktok: [config.TIKTOK_CLIENT_ID, config.TIKTOK_CLIENT_SECRET],
        instagram: [config.INSTAGRAM_CLIENT_ID, config.INSTAGRAM_CLIENT_SECRET],
        linkedin: [config.LINKEDIN_CLIENT_ID, config.LINKEDIN_CLIENT_SECRET],
      }

      const [clientId, clientSecret] = credentials[platform]

      return {
        clientId: clientId ?? "",
        clientSecret,
        redirectUri: `${config.APP_ORIGIN}/social/callback/${platform}`,
        fetch,
        credentialSink: sink,
        linkedinApiVersion: config.LINKEDIN_API_VERSION,
        instagramApiVersion: config.META_API_VERSION,
      }
    }

    function credential(
      workspaceId: string,
      channel: Channel,
      stores: Effect.Success<ReturnType<typeof makeSdkStores>>,
    ) {
      return Effect.gen(function* () {
        const key = credentialKey(
          workspaceId,
          channel.backend,
          channel.platform,
          channel.accountId,
        )

        const stored = yield* db.credential(key)

        if (!stored)
          return yield* Effect.fail(
            new ApiError({
              code: "not-configured",
              message: "Account credentials are missing; reconnect account",
            }),
          )

        const value = yield* encryption
          .decrypt(stored.ciphertext)
          .pipe(Effect.flatMap(decodeCredential))

        if (
          !value.expiresAt ||
          Date.parse(value.expiresAt) >
            DateTime.toEpochMillis(yield* DateTime.now) + 60000
        )
          return value

        if (channel.platform === "facebook")
          return yield* Effect.fail(
            new ApiError({
              code: "not-configured",
              message: "Facebook Page token expired; reconnect Page",
            }),
          )

        const manager = new CredentialManager(
          stores.credentials,
          stores.lock,
          120000,
        )

        let refreshStarted = false

        function reconnectRequired() {
          return channelsDb.upsertChannel({
            ...channel,
            status: "reconnect-required",
          })
        }

        return yield* sdkRequest(() =>
          manager.rotate(key, (current) =>
            stores.bridge(
              Effect.gen(function* () {
                if (
                  current.expiresAt &&
                  Date.parse(current.expiresAt) >
                    DateTime.toEpochMillis(yield* DateTime.now) + 60000
                )
                  return current
                yield* Effect.sync(() => {
                  refreshStarted = true
                })

                if (channel.platform === "bluesky") {
                  const sessionData = yield* Schema.decodeUnknownEffect(
                    Schema.fromJsonString(JsonValueSchema),
                  )(current.metadata?.session ?? "").pipe(
                    Effect.mapError(sdkError),
                  )

                  const session = yield* Effect.try({
                    try: () => parseBlueskyOAuthSession(sessionData),
                    catch: sdkError,
                  })

                  const next = yield* sdkRequest((signal) =>
                    refreshBlueskyOAuthSession(session, {
                      clientId: config.BLUESKY_CLIENT_ID ?? "",
                      fetch(input, init) {
                        return globalThis.fetch(input, {
                          ...init,
                          signal: AbortSignal.any([
                            signal,
                            ...(init?.signal ? [init.signal] : []),
                          ]),
                        })
                      },
                      resolveTxt: (hostname) => stores.bridge(dnsTxt(hostname)),
                    }),
                  )

                  return {
                    accessToken: next.accessToken,
                    expiresAt: next.expiresAt,
                    metadata: { session: JSON.stringify(next) },
                  }
                }

                if (channel.platform === "facebook")
                  return yield* Effect.fail(
                    new ApiError({
                      code: "not-configured",
                      message: "Reconnect Facebook Page",
                    }),
                  )
                const platform = channel.platform

                return yield* sdkRequest((signal) =>
                  refreshOAuthToken(
                    platform,
                    {
                      ...oauthOptions(platform),
                      fetch(input, init) {
                        return globalThis.fetch(input, {
                          ...init,
                          signal: AbortSignal.any([
                            signal,
                            ...(init?.signal ? [init.signal] : []),
                          ]),
                        })
                      },
                    },
                    current,
                  ),
                )
              }).pipe(
                Effect.onInterrupt(() =>
                  reconnectRequired().pipe(
                    Effect.catch(() =>
                      Effect.logError(
                        "Credential recovery state write failed; reconnect account",
                      ),
                    ),
                  ),
                ),
                Effect.timeoutOrElse({
                  duration: "60 seconds",
                  orElse: () =>
                    Effect.fail(
                      new ApiError({
                        code: "upstream-failure",
                        message:
                          "Credential refresh timed out; reconnect before retry",
                      }),
                    ),
                }),
              ),
            ),
          ),
        ).pipe(
          Effect.tapError(() =>
            refreshStarted ? reconnectRequired() : Effect.void,
          ),
        )
      })
    }

    function adapter(
      workspaceId: string,
      channel: Channel,
      stores: Effect.Success<ReturnType<typeof makeSdkStores>>,
    ) {
      return Effect.gen(function* () {
        yield* requirePlatform(channel.platform)
        const value = yield* credential(workspaceId, channel, stores)
        const accessToken = value.accessToken

        switch (channel.platform) {
          case "x":
            return x({
              auth: { userId: channel.accountId, accessToken },
              fetch,
            })
          case "threads":
            return threads({
              backend: channel.backend,
              auth: { userId: channel.accountId, accessToken },
              fetch,
              workflowStore: stores.threadWorkflows,
            })
          case "instagram":
            return instagram({
              auth: { accountId: channel.accountId, accessToken },
              fetch,
              workflowStore: stores.instagramWorkflows,
            })
          case "youtube":
            return youtube({
              auth: { channelId: channel.accountId, accessToken },
              fetch,
              saveUploadSession(session) {
                return stores.saveUpload(workspaceId, channel.id, session)
              },
            })
          case "tiktok":
            return tiktok({
              auth: { openId: channel.accountId, accessToken },
              fetch,
              verifiedMediaOrigins: config.TIKTOK_VERIFIED_MEDIA_ORIGINS,
            })
          case "linkedin": {
            const author = channel.accountId

            if (
              !author.startsWith("urn:li:person:") &&
              !author.startsWith("urn:li:organization:")
            )
              return yield* Effect.fail(
                new ApiError({
                  code: "invalid-input",
                  message: "LinkedIn account must be an author URN",
                }),
              )

            const validated = yield* Schema.decodeUnknownEffect(
              Schema.Union([
                Schema.TemplateLiteral(["urn:li:person:", Schema.String]),
                Schema.TemplateLiteral(["urn:li:organization:", Schema.String]),
              ]),
            )(author).pipe(Effect.mapError(sdkError))

            return linkedin({
              auth: { author: validated, accessToken },
              apiVersion: config.LINKEDIN_API_VERSION ?? "",
              fetch,
            })
          }

          case "facebook":
            return facebookAdapter(
              config,
              channel.accountId,
              accessToken,
              stores.bridge,
            )
          case "bluesky": {
            const sessionData = yield* Schema.decodeUnknownEffect(
              Schema.fromJsonString(JsonValueSchema),
            )(value.metadata?.session ?? "").pipe(Effect.mapError(sdkError))

            const session = yield* Effect.try({
              try: () => parseBlueskyOAuthSession(sessionData),
              catch: sdkError,
            })

            const transport = blueskyOAuthTransport(session, { fetch })

            return bluesky({
              backend: channel.backend,
              auth: { service: transport.service, did: transport.did },
              session: transport,
              fetch,
              allowMediaHost: (host) =>
                host === new URL(config.APP_ORIGIN).hostname,
            })
          }
        }
      })
    }

    function clientFor(
      userId: string,
      workspaceId: string,
      channels: readonly Channel[],
      operation: OperationName = "posts.publish",
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })

        const stores = yield* makeSdkStores({
          tenantId: workspaceId,
          principalId: userId,
        })

        const backends: Record<string, SocialAdapter<unknown>> = {}

        for (const channel of channels) {
          if (
            channel.workspaceId !== workspaceId ||
            channel.status !== "connected"
          )
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Channel is not connected in this workspace",
              }),
            )

          const grants = yield* db.grants(
            workspaceId,
            channel.backend,
            channel.platform,
            channel.accountId,
          )

          if (!grants.some((grant) => grant.capabilities.includes(operation)))
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Channel grant was revoked",
              }),
            )
          backends[channel.backend] = yield* adapter(
            workspaceId,
            channel,
            stores,
          )
        }

        const registry: BackendRegistry = backends

        return {
          client: createSocial({
            backends: registry,
            authorization: stores.authorization,
            idempotencyStore: stores.idempotency,
            concurrency: 2,
            maxQueued: 40,
          }),
          stores,
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
        (outcome) => {
          const channel = channels.find(
            (item) =>
              item.backend === outcome.account.backend &&
              item.accountId === outcome.account.accountId &&
              item.platform === outcome.account.platform,
          )

          if (!channel)
            return Effect.fail(
              new ApiError({
                code: "upstream-failure",
                message: "Provider returned an unknown destination",
              }),
            )

          const delivery: Delivery = {
            id: `${post.id}:${channel.id}`,
            postId: post.id,
            channelId: channel.id,
            platform: channel.platform,
            state: outcome.state,
            message: Match.value(outcome).pipe(
              Match.when({ state: "failed" }, (value) => value.message),
              Match.when(
                { state: "unknown" },
                () => "Submission uncertain; reconcile before retry",
              ),
              Match.when({ state: "not-submitted" }, (value) => value.reason),
              Match.orElse(() => null),
            ),
            url: outcome.state === "published" ? (outcome.url ?? null) : null,
            providerPostId:
              outcome.state === "published"
                ? outcome.post.postId
                : (outcome.delivery?.deliveryId ?? null),
            observedAt: outcome.observedAt,
            retryDisposition: Match.value(outcome).pipe(
              Match.when(
                { state: "failed" },
                (value) => value.retryDisposition.kind,
              ),
              Match.when(
                { state: "unknown" },
                () => "reconcile-first" as const,
              ),
              Match.orElse(() => null),
            ),
          }

          return postsDb.saveDelivery(delivery).pipe(Effect.as(delivery))
        },
        { concurrency: 1 },
      )
    }

    function tiktokCreatorInfo(
      userId: string,
      workspaceId: string,
      channelId: string,
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })
        yield* requirePlatform("tiktok")
        const channel = yield* channelsDb.channel({ workspaceId, channelId })

        if (channel.platform !== "tiktok" || channel.status !== "connected")
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: "Select a connected TikTok channel",
            }),
          )

        const grants = yield* db.grants(
          workspaceId,
          channel.backend,
          channel.platform,
          channel.accountId,
        )

        if (
          !grants.some((grant) => grant.capabilities.includes("posts.publish"))
        )
          return yield* Effect.fail(
            new ApiError({
              code: "forbidden",
              message: "TikTok publishing grant is required",
            }),
          )

        const stores = yield* makeSdkStores({
          tenantId: workspaceId,
          principalId: userId,
        })

        const value = yield* credential(workspaceId, channel, stores)

        const backend = tiktok({
          auth: { openId: channel.accountId, accessToken: value.accessToken },
          fetch,
          verifiedMediaOrigins: config.TIKTOK_VERIFIED_MEDIA_ORIGINS,
        })

        const native = backend.native

        if (!native)
          return yield* Effect.fail(
            new ApiError({
              code: "not-configured",
              message: "TikTok creator information API is unavailable",
            }),
          )

        return yield* sdkRequest((signal) =>
          native.creatorInfo(
            connectedAccountRef({
              backend: channel.backend,
              platform: "tiktok",
              accountId: channel.accountId,
            }),
            {
              backendInstance: channel.backend,
              signal,
              correlationId: crypto.randomUUID(),
              authorization: { tenantId: workspaceId, principalId: userId },
              retryBudget: { maxAttempts: 1, maxElapsedMs: 10000 },
            },
          ),
        )
      })
    }

    function preparePost(
      userId: string,
      workspaceId: string,
      post: Post,
      media: readonly Media[],
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })

        if (
          post.workspaceId !== workspaceId ||
          !post.content.channelIds.length ||
          new Set(post.content.channelIds).size !==
            post.content.channelIds.length ||
          media.some((item) => item.workspaceId !== workspaceId) ||
          post.content.mediaIds.some(
            (id) => !media.some((item) => item.id === id),
          )
        )
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: "Post destinations or media are invalid",
            }),
          )

        if (
          new Set(post.content.overrides.map((override) => override.channelId))
            .size !== post.content.overrides.length ||
          post.content.overrides.some(
            (override) => !post.content.channelIds.includes(override.channelId),
          )
        )
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message:
                "Platform overrides must identify one selected destination each",
            }),
          )

        const attachments: MediaAttachment[] = media.flatMap(
          (item): MediaAttachment[] =>
            post.content.mediaIds.includes(item.id)
              ? [
                  {
                    kind: item.kind,
                    source: { kind: "https-url", url: item.url },
                    mimeType: item.mediaType,
                    filename: item.name,
                    byteSize: item.bytes,
                  },
                ]
              : [],
        )

        for (const item of attachments) {
          if (item.source.kind !== "https-url") continue
          const source = item.source

          const url = yield* Effect.try({
            try: () => new URL(source.url),
            catch: sdkError,
          })

          if (url.protocol !== "https:" || url.origin !== config.APP_ORIGIN)
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "Media must use the application's secure origin",
              }),
            )
        }

        const channels = yield* Effect.forEach(
          post.content.channelIds,
          (id) => channelsDb.channel({ workspaceId, channelId: id }),
          { concurrency: 1 },
        )

        const targets = yield* preparePublicationTargets({
          config,
          post,
          channels,
          attachments,
        })

        const { client, stores } = yield* clientFor(
          userId,
          workspaceId,
          channels,
        )

        const request = {
          targets,
          content: { text: post.content.text, media: attachments },
        }

        const plan = yield* Effect.try({
          try: () => client.posts.prepare(request),
          catch: sdkError,
        })

        if (!plan.ok)
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: plan.issues.map((issue) => issue.message).join("; "),
            }),
          )

        for (const [index, target] of targets.entries()) {
          if (target.account.platform !== "tiktok") continue

          const channel = channels.find(
            (item) =>
              item.backend === target.account.backend &&
              item.accountId === target.account.accountId,
          )

          if (!channel)
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "TikTok destination is unavailable",
              }),
            )

          const creatorInfo = yield* tiktokCreatorInfo(
            userId,
            workspaceId,
            channel.id,
          )

          targets[index] = {
            ...target,
            options: { ...target.options, creatorInfo },
          }
        }

        const currentPlan = yield* Effect.try({
          try: () => client.posts.prepare(request),
          catch: sdkError,
        })

        if (!currentPlan.ok)
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: currentPlan.issues
                .map((issue) => issue.message)
                .join("; "),
            }),
          )

        return { client, stores, channels, request }
      })
    }

    const connections = yield* makeConnectionOperations({
      config,
      provider,
      requirePlatform,
    })

    const analytics = yield* makeChannelAnalytics(
      ({ userId, workspaceId, channel }) =>
        clientFor(userId, workspaceId, [channel], "analytics.account.read"),
    )

    const operations = {
      ...connections,
      tiktokCreatorInfo,
      availability(this: void) {
        return Effect.succeed(platformAvailability(config))
      },
      prepare(
        this: void,
        userId: string,
        workspaceId: string,
        post: Post,
        media: readonly Media[],
      ) {
        return preparePost(userId, workspaceId, post, media).pipe(Effect.asVoid)
      },
      publish(
        this: void,
        userId: string,
        workspaceId: string,
        post: Post,
        media: readonly Media[],
        idempotencyKey: string,
      ) {
        return Effect.gen(function* () {
          const prepared = yield* preparePost(userId, workspaceId, post, media)
          const { client, stores, channels } = prepared

          const request = {
            ...prepared.request,
            idempotencyKey: `${post.id}:${idempotencyKey}`,
          }

          const result = yield* sdkRequest((signal) =>
            client.posts.publish(request, {
              signal,
              authorization: { principalId: userId, tenantId: workspaceId },
              retryBudget: { maxAttempts: 1, maxElapsedMs: 60000 },
            }),
          )

          const deliveries = yield* saveOutcomes(
            post,
            channels,
            result.outcomes,
          )

          if (stores.persistenceFailure())
            return yield* Effect.fail(
              new ApiError({
                code: "storage-failure",
                message:
                  "Delivery log write failed; reconciliation required before retry",
              }),
            )

          return deliveries
        })
      },
      analytics,
      reconcile(this: void, userId: string, workspaceId: string, post: Post) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({ userId, workspaceId })

          if (post.workspaceId !== workspaceId)
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Post belongs to another workspace",
              }),
            )

          const channels = yield* Effect.forEach(
            post.content.channelIds,
            (id) => channelsDb.channel({ workspaceId, channelId: id }),
            { concurrency: 1 },
          )

          const { client } = yield* clientFor(
            userId,
            workspaceId,
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
              updated.find((item) => item.channelId === delivery.channelId) ??
              delivery,
          )
        })
      },
    }

    return {
      ...operations,
      tiktokCreatorInfo: gate.wrap(operations.tiktokCreatorInfo),
      begin: gate.wrap(operations.begin),
      discover: gate.wrap(operations.discover),
      discovered: gate.wrap(operations.discovered),
      select: gate.wrap(operations.select),
      disconnect: gate.wrap(operations.disconnect),
      prepare: gate.wrap(operations.prepare),
      publish: gate.wrap(operations.publish),
      analytics: gate.wrap(operations.analytics),
      reconcile: gate.wrap(operations.reconcile),
    }
  })
}

export class SocialService extends Context.Service<
  SocialService,
  Effect.Success<ReturnType<typeof makeSocial>>
>()("social/SocialService") {}

export function socialLayer(config: AppConfig) {
  return Layer.effect(SocialService, makeSocial(config))
}
