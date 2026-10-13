import { Schema } from "effect"

export const InviteToken = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isPattern(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  ),
)

const InviteSearchInput = Schema.Struct({
  token: Schema.optional(Schema.Unknown),
})

export function inviteSearch(search: typeof InviteSearchInput.Type) {
  return {
    token: Schema.is(Schema.Struct({ token: InviteToken }))(search)
      ? search.token
      : undefined,
  }
}
