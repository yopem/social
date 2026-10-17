import { DateTime, Effect, Option, Schema } from "effect"

import { PostContent } from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"

export const ComposerForm = PostContent.check(
  Schema.makeFilter(
    (value) => value.text.trim().length > 0 || value.mediaIds.length > 0,
    { message: "Add text or media before saving." },
  ),
)

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
