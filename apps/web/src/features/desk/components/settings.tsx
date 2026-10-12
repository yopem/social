import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Effect } from "effect"
import { useState } from "react"

import { ApiError, type Workspace } from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/ui/dialog"
import { Input } from "ui/components/ui/input"

import {
  Choice,
  Failure,
  FormErrors,
  PageHeading,
  deskStyles,
} from "../../../components/desk-ui"
import { effectMutation, rpcMutation, workspaceQuery } from "../queries"
import { InviteForm } from "../schema"

export function Settings({ workspace }: { workspace: Workspace }) {
  return (
    <div {...stylex.props(deskStyles.stack)}>
      <PageHeading title="Workspace settings" />
      <dl>
        <dt>Name</dt>
        <dd>{workspace.name}</dd>
        <dt>Type</dt>
        <dd>{workspace.kind}</dd>
        <dt>Timezone</dt>
        <dd>{workspace.timezone}</dd>
        <dt>Your role</dt>
        <dd>{workspace.role}</dd>
      </dl>
      {workspace.role !== "editor" ? (
        <Members workspaceId={workspace.id} />
      ) : (
        <p>Only owners and admins can manage workspace members.</p>
      )}
    </div>
  )
}

export function Members({ workspaceId }: { workspaceId: string }) {
  const client = useQueryClient()
  const query = useQuery(
    workspaceQuery(workspaceId, "members", (rpc) =>
      rpc.WorkspaceMembers({ workspaceId }),
    ),
  )
  const remove = useMutation(
    rpcMutation(client, workspaceId, (rpc, userId: string) =>
      rpc.WorkspaceRemoveMember({ workspaceId, userId }),
    ),
  )
  const [open, setOpen] = useState(false)
  return (
    <section {...stylex.props(deskStyles.stack)}>
      <h2>Members</h2>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button />}>Invite member</DialogTrigger>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Invite member</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <InviteFields workspaceId={workspaceId} />
          </DialogPanel>
        </DialogPopup>
      </Dialog>
      <Failure error={query.error ?? remove.error} />
      {query.isPending && <p role="status">Loading members…</p>}
      {query.data?.map((member) => (
        <div key={member.user.id} {...stylex.props(deskStyles.flat)}>
          <p>
            {member.user.name} · {member.user.email} · {member.role}
          </p>
          {member.role === "owner" ? (
            <p>Workspace owner cannot be removed.</p>
          ) : (
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ${member.user.name} from this workspace?`,
                  )
                )
                  remove.mutate(member.user.id)
              }}
            >
              Remove {member.user.name}
            </Button>
          )}
        </div>
      ))}
    </section>
  )
}

export function InviteFields({ workspaceId }: { workspaceId: string }) {
  const client = useQueryClient()
  const invite = useMutation(
    rpcMutation(client, workspaceId, (rpc, input: typeof InviteForm.Type) =>
      rpc.WorkspaceInvite({ workspaceId, ...input }),
    ),
  )
  const copy = useMutation(
    effectMutation((url: string) =>
      Effect.tryPromise({
        try: () => navigator.clipboard.writeText(url),
        catch: () =>
          new ApiError({
            code: "upstream-failure",
            message:
              "Could not copy. Select the invite link and copy it manually.",
          }),
      }),
    ),
  )
  const form = useForm({
    defaultValues: { email: "", role: "editor" as "editor" | "admin" },
    validators: { onBlur: InviteForm, onSubmit: InviteForm },
    onSubmit: ({ value }) => invite.mutate(value),
  })
  return (
    <form
      {...stylex.props(deskStyles.stack)}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="email">
        {(field) => (
          <label {...stylex.props(deskStyles.label)}>
            Invitation email
            <Input
              type="email"
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <Choice
            label="Invitation role"
            value={field.state.value}
            onBlur={field.handleBlur}
            options={[
              { value: "editor", label: "Editor" },
              { value: "admin", label: "Admin" },
            ]}
            onChange={(role) => {
              if (role === "editor" || role === "admin")
                field.handleChange(role)
            }}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => <FormErrors errors={errors} />}
      </form.Subscribe>
      <Failure error={invite.error ?? copy.error} />
      <Button type="submit" loading={invite.isPending}>
        Create invite link
      </Button>
      {invite.data && (
        <>
          <label {...stylex.props(deskStyles.label)}>
            Invite link
            <Input readOnly value={invite.data.url} />
          </label>
          <Button
            variant="outline"
            onClick={() => copy.mutate(invite.data.url)}
          >
            Copy invite link
          </Button>
          {copy.isSuccess && <p role="status">Invite link copied.</p>}
          <p>Share this link with the invited member. No email is sent.</p>
        </>
      )}
    </form>
  )
}
