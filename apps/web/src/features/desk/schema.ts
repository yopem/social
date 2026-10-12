import { DateTime, Effect, Option, Schema } from "effect"

import {
  ApiError,
  Name,
  PostContent,
  WorkspaceKind,
} from "rpc/contracts/models"

export const WorkspaceForm = Schema.Struct({
  name: Name,
  kind: WorkspaceKind,
  timezone: Schema.String.check(
    Schema.makeFilter((value) => Option.isSome(DateTime.zoneMakeNamed(value)), {
      message: "Enter a valid IANA timezone.",
    }),
  ),
})

export const ComposerForm = PostContent.check(
  Schema.makeFilter(
    (value) => value.text.trim().length > 0 || value.mediaIds.length > 0,
    { message: "Add text or media before saving." },
  ),
)

export const FeedForm = Schema.Struct({
  url: Schema.String.check(
    Schema.makeFilter(
      (value) => {
        const parsed = URL.canParse(value) ? new URL(value) : null

        return (
          parsed !== null &&
          (parsed.protocol === "https:" || parsed.protocol === "http:")
        )
      },
      { message: "Enter a valid HTTP or HTTPS feed URL." },
    ),
  ),
  name: Name,
  mode: Schema.Literals(["draft", "automatic"]),
  channelIds: Schema.Array(Schema.String),
  includeImages: Schema.Boolean,
  includeVideos: Schema.Boolean,
  enabled: Schema.Boolean,
})

export const InviteForm = Schema.Struct({
  email: Schema.String.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: "Enter a valid email address.",
    }),
  ),
  role: Schema.Literals(["admin", "editor"]),
})

export const scheduleTime = Effect.fn("scheduleTime")(function* (
  input: string,
  timezone: string,
) {
  const invalid = new ApiError({
    code: "invalid-input",
    message:
      "Enter a valid publish time. Repeated or skipped daylight-saving times are not allowed.",
  })

  yield* Schema.decodeUnknownEffect(
    Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  )(input).pipe(Effect.mapError(() => invalid))

  const date = DateTime.makeZoned(`${input}:00Z`, {
    timeZone: timezone,
    adjustForTimeZone: true,
    disambiguation: "reject",
  })

  if (Option.isNone(date)) return yield* Effect.fail(invalid)

  return DateTime.formatIso(date.value)
})
