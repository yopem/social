import { DateTime, Effect, Option, Schema } from "effect"

import { PostContent } from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"
import { Id } from "rpc/lib/schema"

import { dateBounds } from "@/features/posts/calendar"

export const PostFilterSearch = Schema.Struct({
  date: Schema.optional(
    Schema.String.check(
      Schema.makeFilter(
        (date) => date === "" || dateBounds({ date, timezone: "UTC" }) !== null,
        { message: "Enter a valid calendar date." },
      ),
    ),
  ),
  month: Schema.optional(
    Schema.String.check(
      Schema.makeFilter(
        (month) =>
          dateBounds({ date: `${month}-01`, timezone: "UTC" }) !== null,
        { message: "Enter a valid calendar month." },
      ),
    ),
  ),
  channelId: Schema.optional(Id),
})

export const PublishingSearch = Schema.Struct({
  ...PostFilterSearch.fields,
  view: Schema.optional(Schema.Literals(["queue", "history"])),
})

export const ComposerForm = PostContent.check(
  Schema.makeFilter(
    (value) => value.text.trim().length > 0 || value.mediaIds.length > 0,
    { message: "Add text or media before saving." },
  ),
)

export const scheduleTime = Effect.fn("scheduleTime")(function* ({
  localDateTime,
  timezone,
}: {
  localDateTime: string
  timezone: string
}) {
  const invalid = new ApiError({
    code: "invalid-input",
    message:
      "Enter a valid publish time. Repeated or skipped daylight-saving times are not allowed.",
  })

  yield* Schema.decodeUnknownEffect(
    Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)),
  )(localDateTime).pipe(Effect.mapError(() => invalid))

  const date = DateTime.makeZoned(`${localDateTime}:00Z`, {
    timeZone: timezone,
    adjustForTimeZone: true,
    disambiguation: "reject",
  })

  if (Option.isNone(date)) return yield* Effect.fail(invalid)

  return DateTime.formatIso(date.value)
})
