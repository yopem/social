import {
  answerLinkedInWebhookChallenge,
  answerMetaWebhookChallenge,
  answerXWebhookChallenge,
  answerYouTubeWebhookChallenge,
  decodePlatformWebhook,
  verifyLinkedInWebhook,
  verifyMetaWebhook,
  verifyTikTokWebhook,
  verifyXWebhook,
  verifyYouTubeWebhook,
} from "@opencoredev/social-sdk/server"
import { DateTime, Effect, Schema } from "effect"
import {
  EventSchema,
  type SocialWebhookEvent,
} from "server/features/channels/inbox"

import { CredentialCrypto } from "auth/services/crypto"
import { SocialDb } from "db/services/channels/social"
import type { AppConfig } from "env/server"
import { Platform } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"
import { JsonValueSchema } from "rpc/lib/json"

export interface WebhookOptions {
  readonly metaVerifyToken?: string
  readonly youtubeSecret?: string
  readonly youtubeTopics?: readonly string[]
}

function invalid() {
  return new ApiError({
    code: "forbidden",
    message: "Webhook signature or payload is invalid",
  })
}

function sdk<A>(call: () => Promise<A>) {
  return Effect.tryPromise({ try: call, catch: invalid })
}

function readBody(request: Request) {
  return Effect.gen(function* () {
    const reader = request.body?.getReader()

    if (!reader) return yield* Effect.fail(invalid())
    let size = 0
    const chunks: Uint8Array[] = []

    try {
      for (;;) {
        const result = yield* Effect.tryPromise({
          try: () => reader.read(),
          catch: invalid,
        })

        if (result.done) break
        size += result.value.length

        if (size > 1048576)
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: "Webhook body exceeds one MiB",
            }),
          )
        chunks.push(result.value)
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

    return bytes
  }).pipe(
    Effect.timeoutOrElse({
      duration: "10 seconds",
      orElse: () => Effect.fail(invalid()),
    }),
  )
}

export function socialWebhook(
  request: Request,
  config: AppConfig,
  options: WebhookOptions = {},
) {
  return Effect.gen(function* () {
    const url = new URL(request.url)

    const platform = yield* Schema.decodeUnknownEffect(Platform)(
      url.pathname.split("/")[2],
    ).pipe(Effect.mapError(invalid))

    if (url.pathname !== `/webhooks/${platform}` || platform === "bluesky")
      return new Response("Webhook unsupported; use polling", { status: 404 })

    const secrets = {
      x: config.X_CLIENT_SECRET,
      threads: config.THREADS_CLIENT_SECRET,
      instagram: config.INSTAGRAM_CLIENT_SECRET,
      tiktok: config.TIKTOK_CLIENT_SECRET,
      linkedin: config.LINKEDIN_CLIENT_SECRET,
      facebook: config.FACEBOOK_CLIENT_SECRET,
      youtube: options.youtubeSecret,
    }

    const secret = secrets[platform]

    if (!secret)
      return yield* Effect.fail(
        new ApiError({
          code: "not-configured",
          message: "Webhook verification secret is not configured",
        }),
      )

    if (request.method === "GET") {
      if (platform === "tiktok")
        return new Response(null, { status: 405, headers: { Allow: "POST" } })
      let answer

      if (
        platform === "facebook" ||
        platform === "threads" ||
        platform === "instagram"
      ) {
        if (!options.metaVerifyToken)
          return yield* Effect.fail(
            new ApiError({
              code: "not-configured",
              message: "Meta webhook verification token is not configured",
            }),
          )
        answer = yield* sdk(() =>
          answerMetaWebhookChallenge({
            verifyToken: options.metaVerifyToken ?? "",
            query: url.searchParams,
          }),
        )
      } else if (platform === "x")
        answer = yield* sdk(() =>
          answerXWebhookChallenge({ secret, query: url.searchParams }),
        )
      else if (platform === "linkedin")
        answer = yield* sdk(() =>
          answerLinkedInWebhookChallenge({ secret, query: url.searchParams }),
        )
      else
        answer = yield* Effect.try({
          try: () =>
            answerYouTubeWebhookChallenge({
              query: url.searchParams,
              topics: options.youtubeTopics ?? [],
            }),
          catch: invalid,
        })

      return new Response(answer.body, {
        status: answer.status,
        headers: answer.headers,
      })
    }

    if (request.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: { Allow: "GET, POST" },
      })
    const body = yield* readBody(request)
    const input = { secret, headers: request.headers, body, maxBytes: 1048576 }

    switch (platform) {
      case "facebook":
      case "threads":
      case "instagram":
        yield* sdk(() => verifyMetaWebhook(input))
        break
      case "x":
        yield* sdk(() => verifyXWebhook(input))
        break
      case "tiktok":
        yield* sdk(() => verifyTikTokWebhook(input))
        break
      case "linkedin":
        yield* sdk(() => verifyLinkedInWebhook(input))
        break
      case "youtube":
        yield* sdk(() => verifyYouTubeWebhook(input))
        break
    }

    const cipher = yield* CredentialCrypto
    const db = yield* SocialDb
    let event: SocialWebhookEvent

    if (platform === "facebook") {
      const data = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Record(Schema.String, JsonValueSchema)),
      )(new TextDecoder().decode(body)).pipe(Effect.mapError(invalid))

      const meta = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          object: Schema.Literal("page"),
          entry: Schema.Array(Schema.Struct({ id: Schema.String })),
        }),
      )(data).pipe(Effect.mapError(invalid))

      const digest = yield* Effect.tryPromise({
        try: () => crypto.subtle.digest("SHA-256", body),
        catch: invalid,
      })

      const id = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")

      event = {
        version: 1,
        id,
        backend: "facebook",
        provider: "facebook",
        type: "unknown",
        identity: "body-digest",
        originalType: "page",
        receivedAt: DateTime.formatIso(yield* DateTime.now),
        accountIds: [...new Set(meta.entry.map((entry) => entry.id))],
        data,
      }
    } else {
      const decoded = yield* sdk(() =>
        decodePlatformWebhook({
          platform,
          backend: platform,
          body,
          maxBytes: 1048576,
        }),
      )

      event = yield* Schema.decodeUnknownEffect(EventSchema)(decoded).pipe(
        Effect.mapError(invalid),
      )
    }

    const routes = yield* Effect.forEach(
      event.accountIds,
      (accountId) => db.resolveTenants(platform, [accountId]),
      { concurrency: 2 },
    )

    const tenants = [...new Set(routes.flat())]

    const quarantined =
      routes.length === 0 || routes.some((route) => route.length === 0)

    const key = yield* cipher.hash(JSON.stringify([platform, event.id]))
    const ciphertext = yield* cipher.encrypt(JSON.stringify(event))

    const state = yield* db.acceptInbox(
      key,
      platform,
      ciphertext,
      tenants,
      quarantined,
    )

    return Response.json(
      { state, quarantined },
      { status: 202, headers: { "cache-control": "no-store" } },
    )
  })
}
