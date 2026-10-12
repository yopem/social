import { DateTime, Effect, Option, Schema } from "effect"

import {
  ApiError,
  Name,
  PostContent,
  WorkspaceKind,
} from "rpc/contracts/models"

export const WorkspaceForm = Schema.standardSchemaV1(
  Schema.Struct({
    name: Name,
    kind: WorkspaceKind,
    timezone: Schema.String.pipe(
      Schema.filter((value) => Option.isSome(DateTime.zoneMakeNamed(value)), {
        message: () => "Enter a valid IANA timezone.",
      }),
    ),
  }),
)

export const ComposerForm = Schema.standardSchemaV1(
  PostContent.pipe(
    Schema.filter(
      (value) => value.text.trim().length > 0 || value.mediaIds.length > 0,
      { message: () => "Add text or media before saving." },
    ),
  ),
)

export const FeedForm = Schema.standardSchemaV1(
  Schema.Struct({
    url: Schema.String.pipe(
      Schema.filter(
        (value) => {
          const parsed = URL.canParse(value) ? new URL(value) : null
          return (
            parsed !== null &&
            (parsed.protocol === "https:" || parsed.protocol === "http:")
          )
        },
        { message: () => "Enter a valid HTTP or HTTPS feed URL." },
      ),
    ),
    name: Name,
    mode: Schema.Literal("draft", "automatic"),
    channelIds: Schema.Array(Schema.String),
    includeImages: Schema.Boolean,
    includeVideos: Schema.Boolean,
    enabled: Schema.Boolean,
  }),
)

export const InviteForm = Schema.standardSchemaV1(
  Schema.Struct({
    email: Schema.String.pipe(
      Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
        message: () => "Enter a valid email address.",
      }),
    ),
    role: Schema.Literal("admin", "editor"),
  }),
)

export function scheduleTime(input: string, timezone: string) {
  return Effect.gen(function* () {
    const invalid = new ApiError({
      code: "invalid-input",
      message:
        "Enter a valid publish time. Repeated or skipped daylight-saving times are not allowed.",
    })
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))
      return yield* Effect.fail(invalid)
    const date = DateTime.makeZoned(`${input}:00Z`, {
      timeZone: timezone,
      adjustForTimeZone: true,
      disambiguation: "reject",
    })
    if (Option.isNone(date)) return yield* Effect.fail(invalid)
    return DateTime.formatIso(date.value)
  })
}
