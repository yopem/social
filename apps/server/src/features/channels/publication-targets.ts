import type { MediaAttachment, PublishTarget } from "@opencoredev/social-sdk"

import { connectedAccountRef } from "@opencoredev/social-sdk"
import { Effect, Schema } from "effect"
import { sdkError } from "server/features/channels/sdk-request"

import type { AppConfig } from "env/server"
import type { Channel } from "rpc/contracts/channels"
import type { Post } from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"
import { JsonValueSchema } from "rpc/lib/json"

const TikTokSettings = Schema.Struct({
  brandedContent: Schema.Boolean,
  ownBrand: Schema.Boolean,
  aiGenerated: Schema.Boolean,
  draft: Schema.Boolean,
  disableComment: Schema.Boolean,
  disableDuet: Schema.Boolean,
  disableStitch: Schema.Boolean,
  creatorInfo: Schema.Record(Schema.String, JsonValueSchema),
  photoCoverIndex: Schema.optional(
    Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0))),
  ),
})

export function preparePublicationTargets({
  config,
  post,
  channels,
  attachments,
}: {
  config: Pick<AppConfig, "TIKTOK_VERIFIED_MEDIA_ORIGINS">
  post: Post
  channels: readonly Channel[]
  attachments: MediaAttachment[]
}) {
  return Effect.gen(function* () {
    const targets: PublishTarget[] = []

    for (const channel of channels) {
      const override = post.content.overrides.find(
        (item) => item.channelId === channel.id,
      )

      const allowedSettings = new Set(["channelId", "text"])

      if (channel.platform === "youtube")
        for (const key of ["title", "visibility", "madeForKids"])
          allowedSettings.add(key)

      if (channel.platform === "tiktok")
        for (const key of [
          "privacyLevel",
          "creatorConsent",
          "disableComment",
          "disableDuet",
          "disableStitch",
          "brandedContent",
          "ownBrand",
          "aiGenerated",
          "draft",
          "creatorInfo",
          "photoCoverIndex",
        ])
          allowedSettings.add(key)

      if (channel.platform === "linkedin") allowedSettings.add("visibility")

      if (
        override &&
        Object.entries(override).some(
          ([key, value]) => value !== undefined && !allowedSettings.has(key),
        )
      )
        return yield* Effect.fail(
          new ApiError({
            code: "invalid-input",
            message: `Unsupported platform setting for ${channel.platform}`,
          }),
        )

      const account = connectedAccountRef({
        backend: channel.backend,
        platform: channel.platform,
        accountId: channel.accountId,
      })

      const content = {
        text: override?.text ?? post.content.text,
        media: attachments,
      }

      if (channel.platform === "youtube") {
        if (
          !override?.title ||
          !override.visibility ||
          override.madeForKids === undefined ||
          attachments.length !== 1 ||
          attachments[0]?.kind !== "video"
        )
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message:
                "YouTube requires one video, title, visibility, and made-for-kids setting",
            }),
          )
        targets.push({
          account,
          content,
          options: {
            title: override.title,
            visibility: override.visibility,
            madeForKids: override.madeForKids,
          },
        })
      } else if (channel.platform === "tiktok") {
        const privacy = override?.privacyLevel

        if (
          !override?.creatorConsent ||
          !privacy ||
          ![
            "SELF_ONLY",
            "MUTUAL_FOLLOW_FRIENDS",
            "FOLLOWER_OF_CREATOR",
            "PUBLIC_TO_EVERYONE",
          ].includes(privacy) ||
          !attachments.length
        )
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message:
                "TikTok requires explicit creator consent, privacy, and media",
            }),
          )

        const parsed = yield* Schema.decodeUnknownEffect(
          Schema.Literals([
            "SELF_ONLY",
            "MUTUAL_FOLLOW_FRIENDS",
            "FOLLOWER_OF_CREATOR",
            "PUBLIC_TO_EVERYONE",
          ]),
        )(privacy).pipe(Effect.mapError(sdkError))

        const settings = yield* Schema.decodeUnknownEffect(TikTokSettings)(
          override,
        ).pipe(
          Effect.mapError(
            () =>
              new ApiError({
                code: "invalid-input",
                message:
                  "TikTok requires a creator information preview and explicit interaction, disclosure, AI, and draft choices",
              }),
          ),
        )

        for (const item of attachments)
          if (
            item.source.kind === "https-url" &&
            !config.TIKTOK_VERIFIED_MEDIA_ORIGINS.includes(
              new URL(item.source.url).origin,
            )
          )
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "TikTok media origin must be verified",
              }),
            )
        targets.push({
          account,
          content,
          options: {
            privacy: parsed,
            consentGiven: true,
            disableComments: settings.disableComment,
            disableDuet: settings.disableDuet,
            disableStitch: settings.disableStitch,
            brandedContent: settings.brandedContent,
            ownBrand: settings.ownBrand,
            aiGenerated: settings.aiGenerated,
            draft: settings.draft,
            creatorInfo: settings.creatorInfo,
            photoCoverIndex: settings.photoCoverIndex,
          },
        })
      } else if (channel.platform === "linkedin" && override?.visibility) {
        if (override.visibility !== "public")
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message:
                "LinkedIn requires public visibility; private and unlisted are unsupported",
            }),
          )
        targets.push({
          account,
          content,
          options: { visibility: "public" },
        })
      } else targets.push({ account, content })
    }

    return targets
  })
}
