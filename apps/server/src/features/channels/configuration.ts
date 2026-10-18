import { blueskyOAuthClientMetadata } from "@opencoredev/social-sdk/server"
import { Effect } from "effect"
import { sdkError } from "server/features/channels/sdk-request"

import type { AppConfig } from "env/server"
import type { PlatformAvailability } from "rpc/contracts/channels"
import { Platform } from "rpc/contracts/channels"

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
