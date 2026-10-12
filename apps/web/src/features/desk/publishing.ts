import { Effect, Schema } from "effect"

import {
  ApiError,
  PostContent,
  type Channel,
  type Media,
} from "rpc/contracts/models"

export const validatePublishing = Effect.fn("validatePublishing")(function* (
  content: PostContent,
  channels: readonly Channel[],
  media: readonly Media[],
) {
  yield* Schema.decodeUnknownEffect(PostContent)(content)

  function invalid(message: string) {
    return Effect.fail(new ApiError({ code: "invalid-input", message }))
  }

  if (!content.channelIds.length)
    return yield* invalid("Select at least one channel before publishing.")

  for (const channelId of content.channelIds) {
    const channel = channels.find((item) => item.id === channelId)

    if (channel?.status !== "connected")
      return yield* invalid("Select a connected channel.")

    const override = content.overrides.find(
      (item) => item.channelId === channelId,
    )

    if (
      channel.platform === "youtube" &&
      (!override?.title?.trim() ||
        override.visibility === undefined ||
        override.madeForKids === undefined ||
        media.length !== 1 ||
        media[0]?.kind !== "video")
    )
      return yield* invalid(
        "YouTube requires one video, a title, visibility, and a made-for-kids choice.",
      )

    if (channel.platform === "linkedin" && override?.visibility !== "public")
      return yield* invalid("Choose public visibility for LinkedIn.")

    if (channel.platform === "tiktok") {
      if (
        !override?.creatorInfo ||
        !override.creatorConsent ||
        !override.privacyLevel ||
        [
          override.disableComment,
          override.disableDuet,
          override.disableStitch,
          override.brandedContent,
          override.ownBrand,
          override.aiGenerated,
          override.draft,
        ].some((choice) => choice === undefined)
      )
        return yield* invalid(
          "Review TikTok creator information and make every choice before approval.",
        )

      if (
        media.length === 0 ||
        (media.some((item) => item.kind === "video") &&
          (media.length !== 1 || media[0]?.kind !== "video"))
      )
        return yield* invalid(
          "TikTok requires one video or photos. Do not mix formats.",
        )

      if (
        media.every((item) => item.kind === "image") &&
        override.photoCoverIndex === undefined
      )
        return yield* invalid("Choose a TikTok photo cover.")
    }
  }
})
