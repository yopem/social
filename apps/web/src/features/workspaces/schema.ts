import { DateTime, Option, Schema } from "effect"

import { WorkspaceKind } from "rpc/contracts/workspaces"
import { Name } from "rpc/lib/schema"

export const WorkspaceForm = Schema.Struct({
  name: Name,
  kind: WorkspaceKind,
  timezone: Schema.String.check(
    Schema.makeFilter((value) => Option.isSome(DateTime.zoneMakeNamed(value)), {
      message: "Enter a valid IANA timezone.",
    }),
  ),
})

export const InviteForm = Schema.Struct({
  email: Schema.String.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: "Enter a valid email address.",
    }),
  ),
  role: Schema.Literals(["admin", "editor"]),
})
