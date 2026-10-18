import { Schema } from "effect"

import { WorkspaceInviteInput } from "rpc/contracts/workspaces"

export const InviteForm = Schema.Struct({
  email: WorkspaceInviteInput.fields.email.check(
    Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
      message: "Enter a valid email address.",
    }),
  ),
  role: WorkspaceInviteInput.fields.role,
})
