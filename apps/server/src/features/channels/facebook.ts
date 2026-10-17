import type { DeliveryOutcome, SocialAdapter } from "@opencoredev/social-sdk"
import type {
  ConnectionProvider,
  OAuthCredentialSink,
} from "@opencoredev/social-sdk/server"

import {
  connectedAccountRef,
  defineAdapter,
  platformPostRef,
} from "@opencoredev/social-sdk"
import { DateTime, Effect, Result, Schema } from "effect"

import type { AppConfig } from "env/server"
import { ApiError } from "rpc/lib/errors"

type Bridge = <A>(effect: Effect.Effect<A, ApiError>) => Promise<A>

const Token = Schema.Struct({ access_token: Schema.String })

const Pages = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      access_token: Schema.String,
      tasks: Schema.Array(Schema.String),
    }),
  ),
  paging: Schema.optional(
    Schema.Struct({ next: Schema.optional(Schema.String) }),
  ),
})

const Created = Schema.Struct({
  id: Schema.String,
  post_id: Schema.optional(Schema.String),
})

function invalid() {
  return new ApiError({
    code: "upstream-failure",
    message: "Facebook Graph API request failed",
  })
}

function graphRequest<A, I>(
  schema: Schema.Codec<A, I>,
  url: URL,
  init?: RequestInit,
) {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          ...init,
          signal: AbortSignal.any([
            signal,
            AbortSignal.timeout(10000),
            ...(init?.signal ? [init.signal] : []),
          ]),
          redirect: "error",
        }),
      catch: invalid,
    })

    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? "forbidden"
          : response.status >= 400 &&
              response.status < 500 &&
              response.status !== 408 &&
              response.status !== 429
            ? "invalid-input"
            : "upstream-failure"

      return yield* Effect.fail(
        new ApiError({ code, message: "Facebook rejected the request" }),
      )
    }

    const reader = response.body?.getReader()

    if (!reader) return yield* Effect.fail(invalid())
    const chunks: Uint8Array[] = []
    let size = 0

    try {
      for (;;) {
        const chunk = yield* Effect.tryPromise({
          try: () => reader.read(),
          catch: invalid,
        })

        if (chunk.done) break
        size += chunk.value.byteLength

        if (size > 1048576) return yield* Effect.fail(invalid())
        chunks.push(chunk.value)
      }
    } finally {
      yield* Effect.tryPromise({
        try: () => reader.cancel(),
        catch: invalid,
      }).pipe(Effect.ignore)
    }

    const bytes = new Uint8Array(size)
    let offset = 0

    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }

    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
      new TextDecoder().decode(bytes),
    ).pipe(Effect.mapError(invalid))
  })
}

export function facebookProvider(
  config: AppConfig,
  sink: OAuthCredentialSink,
  bridge: Bridge,
): ConnectionProvider {
  const clientId = config.FACEBOOK_CLIENT_ID ?? ""
  const clientSecret = config.FACEBOOK_CLIENT_SECRET ?? ""

  return {
    start(input) {
      const url = new URL(
        `https://www.facebook.com/${config.META_API_VERSION}/dialog/oauth`,
      )

      url.search = new URLSearchParams({
        client_id: clientId,
        redirect_uri: input.redirectUri,
        state: input.state,
        response_type: "code",
        scope: "pages_show_list,pages_manage_posts,pages_read_engagement",
      }).toString()

      return bridge(Effect.succeed({ authorizationUrl: url.href }))
    },
    complete(input) {
      return bridge(
        Effect.gen(function* () {
          const callback = new URL(input.callbackUrl)
          const code = callback.searchParams.get("code")

          if (!code)
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "Facebook authorization code is missing",
              }),
            )

          const tokenUrl = new URL(
            `https://graph.facebook.com/${config.META_API_VERSION}/oauth/access_token`,
          )

          tokenUrl.search = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uri: input.attempt.redirectUri,
            code,
          }).toString()
          const token = yield* graphRequest(Token, tokenUrl)

          const exchangeUrl = new URL(
            `https://graph.facebook.com/${config.META_API_VERSION}/oauth/access_token`,
          )

          exchangeUrl.search = new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: clientId,
            client_secret: clientSecret,
            fb_exchange_token: token.access_token,
          }).toString()
          const longLived = yield* graphRequest(Token, exchangeUrl)

          const pagesUrl = new URL(
            `https://graph.facebook.com/${config.META_API_VERSION}/me/accounts`,
          )

          pagesUrl.search = new URLSearchParams({
            fields: "id,name,access_token,tasks",
            limit: "100",
          }).toString()

          const pages = yield* graphRequest(Pages, pagesUrl, {
            headers: { Authorization: `Bearer ${longLived.access_token}` },
          })

          if (pages.paging?.next)
            return yield* Effect.fail(
              new ApiError({
                code: "upstream-failure",
                message:
                  "Facebook returned more than 100 Pages; narrow Page permissions before connecting",
              }),
            )
          const accounts = []

          for (const page of pages.data) {
            if (!page.tasks.includes("CREATE_CONTENT")) continue

            const account = {
              ref: connectedAccountRef({
                backend: input.attempt.backend,
                platform: "facebook",
                accountId: page.id,
              }),
              displayName: page.name,
            }

            yield* Effect.tryPromise({
              try: () =>
                sink.save({
                  account,
                  token: { accessToken: page.access_token },
                  attempt: input.attempt,
                }),
              catch: invalid,
            })
            accounts.push(account)
          }

          return accounts
        }),
      )
    },
  }
}

export function facebookAdapter(
  config: AppConfig,
  pageId: string,
  accessToken: string,
  bridge: Bridge,
): SocialAdapter<never> {
  return defineAdapter({
    id: "facebook",
    capabilities: {
      schemaVersion: 1,
      backend: "facebook",
      apiRevision: config.META_API_VERSION,
      runtime: ["web"],
      capabilities: [
        {
          operation: "posts.publish",
          platform: "facebook",
          availability: "available",
          formats: ["text", "image"],
          requiredScopes: ["pages_manage_posts"],
          notes: "Facebook Pages only. App review is required.",
        },
        {
          operation: "posts.read",
          platform: "facebook",
          availability: "available",
        },
      ],
    },
    posts: {
      prepareTarget(target) {
        const media = target.content.media ?? []

        if (
          target.account.accountId !== pageId ||
          target.account.platform !== "facebook" ||
          target.schedule ||
          target.replyTo ||
          media.length > 1 ||
          media.some(
            (item) => item.source.kind !== "https-url" || item.kind !== "image",
          ) ||
          (!target.content.text?.trim() &&
            !media.length &&
            !target.content.link)
        )
          return [
            {
              code: "invalid_input",
              message:
                "Facebook Pages accepts text, link, or one image; videos, carousels, replies, and platform scheduling are unsupported",
              severity: "error",
            },
          ]

        return []
      },
      publishTarget(target, context) {
        return bridge(
          Effect.gen(function* () {
            const base = {
              targetIndex: target.targetIndex,
              account: target.account,
              observedAt: DateTime.formatIso(yield* DateTime.now),
            }

            const media = target.content.media?.[0]
            const body = new URLSearchParams()
            let edge = "feed"

            if (media?.source.kind === "https-url") {
              edge = "photos"
              body.set("url", media.source.url)
              body.set("caption", target.content.text ?? "")
            } else {
              body.set("message", target.content.text ?? "")

              if (target.content.link) body.set("link", target.content.link.url)
            }

            const result = yield* graphRequest(
              Created,
              new URL(
                `https://graph.facebook.com/${config.META_API_VERSION}/${encodeURIComponent(pageId)}/${edge}`,
              ),
              {
                method: "POST",
                headers: { Authorization: `Bearer ${accessToken}` },
                body,
                signal: context.signal,
              },
            ).pipe(Effect.result)

            if (
              Result.isFailure(result) &&
              (result.failure.code === "forbidden" ||
                result.failure.code === "invalid-input")
            )
              return {
                ...base,
                state: "failed",
                code: result.failure.code,
                message:
                  "Facebook rejected the post; check Page permissions and content",
                retryDisposition:
                  result.failure.code === "forbidden"
                    ? { kind: "after-reconnect" }
                    : { kind: "never" },
              } satisfies DeliveryOutcome

            if (Result.isFailure(result))
              return {
                ...base,
                state: "unknown",
                reason: "ambiguous-submission",
                diagnostic:
                  "Facebook submission outcome is uncertain; inspect Page before retry",
              } satisfies DeliveryOutcome
            const postId = result.success.post_id ?? result.success.id

            return {
              ...base,
              state: "published",
              post: platformPostRef({
                backend: context.backendInstance,
                platform: "facebook",
                accountId: pageId,
                postId,
              }),
              url: `https://www.facebook.com/${postId}`,
            } satisfies DeliveryOutcome
          }),
        )
      },
      get(ref) {
        return bridge(
          graphRequest(
            Schema.Record(
              Schema.String,
              Schema.Union([
                Schema.String,
                Schema.Number,
                Schema.Boolean,
                Schema.Null,
              ]),
            ),
            new URL(
              `https://graph.facebook.com/${config.META_API_VERSION}/${encodeURIComponent(ref.postId)}?fields=id,message,permalink_url`,
            ),
            { headers: { Authorization: `Bearer ${accessToken}` } },
          ),
        )
      },
    },
  })
}
