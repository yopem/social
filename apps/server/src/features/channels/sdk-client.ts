import type {
  BackendRegistry,
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
import { DateTime, Duration, Effect, Option, Schema } from "effect"
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http"
import { platformAvailability } from "server/features/channels/configuration"
import {
  facebookAdapter,
  facebookProvider,
} from "server/features/channels/facebook"
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
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import type { Channel, Platform } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"
import { JsonValueSchema } from "rpc/lib/json"

export function credentialIsFresh({
  expiresAt,
  now,
}: {
  expiresAt: string
  now: DateTime.Utc
}) {
  const expires = DateTime.make(expiresAt)

  // Refresh early so the token stays valid during a provider request.
  return (
    Option.isSome(expires) &&
    DateTime.isGreaterThan(
      expires.value,
      DateTime.addDuration(now, Duration.minutes(1)),
    )
  )
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

export function makeSocialClient(config: AppConfig) {
  return Effect.gen(function* () {
    const channelsDb = yield* ChannelsDb
    const workspacesDb = yield* WorkspacesDb
    const db = yield* SocialDb
    const encryption = yield* CredentialCrypto
    const providerFetch = yield* FetchHttpClient.Fetch

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
          fetch: providerFetch,
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
        fetch: providerFetch,
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
          credentialIsFresh({
            expiresAt: value.expiresAt,
            now: yield* DateTime.now,
          })
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
          Duration.toMillis(Duration.minutes(2)),
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
                  credentialIsFresh({
                    expiresAt: current.expiresAt,
                    now: yield* DateTime.now,
                  })
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
                        return providerFetch(input, {
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
                        return providerFetch(input, {
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
              fetch: providerFetch,
            })
          case "threads":
            return threads({
              backend: channel.backend,
              auth: { userId: channel.accountId, accessToken },
              fetch: providerFetch,
              workflowStore: stores.threadWorkflows,
            })
          case "instagram":
            return instagram({
              auth: { accountId: channel.accountId, accessToken },
              fetch: providerFetch,
              workflowStore: stores.instagramWorkflows,
            })
          case "youtube":
            return youtube({
              auth: { channelId: channel.accountId, accessToken },
              fetch: providerFetch,
              saveUploadSession(session) {
                return stores.saveUpload(workspaceId, channel.id, session)
              },
            })
          case "tiktok":
            return tiktok({
              auth: { openId: channel.accountId, accessToken },
              fetch: providerFetch,
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
              fetch: providerFetch,
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

            const transport = blueskyOAuthTransport(session, {
              fetch: providerFetch,
            })

            return bluesky({
              backend: channel.backend,
              auth: { service: transport.service, did: transport.did },
              session: transport,
              fetch: providerFetch,
              allowMediaHost: (host) =>
                host === new URL(config.APP_ORIGIN).hostname,
            })
          }
        }
      })
    }

    function clientFor({
      userId,
      workspaceId,
      channels,
      operation = "posts.publish",
    }: {
      userId: string
      workspaceId: string
      channels: readonly Channel[]
      operation?: OperationName
    }) {
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
          fetch: providerFetch,
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

    return { provider, requirePlatform, clientFor, tiktokCreatorInfo }
  })
}
