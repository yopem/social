import { Schema } from "effect"

import { Name } from "rpc/lib/schema"

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
