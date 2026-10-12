import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Effect, Schema } from "effect"
import { useState } from "react"

import { ApiError, type Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/ui/dialog"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Text } from "ui/components/ui/text"

import {
  Choice,
  Failure,
  FormErrors,
  PageHeading,
  deskStyles,
} from "@/components/desk-ui"
import {
  effectMutation,
  rpcMutation,
  workspaceQuery,
} from "@/features/desk/queries"
import { InviteForm } from "@/features/desk/schema"

export function Settings({ workspace }: { workspace: Workspace }) {
  return (
    <Box xstyle={deskStyles.stack}>
      <PageHeading title="Workspace settings" />
      <Box render={<dl />}>
        <Box render={<dt />}>Name</Box>
        <Box render={<dd />}>{workspace.name}</Box>
        <Box render={<dt />}>Type</Box>
        <Box render={<dd />}>{workspace.kind}</Box>
        <Box render={<dt />}>Timezone</Box>
        <Box render={<dd />}>{workspace.timezone}</Box>
        <Box render={<dt />}>Your role</Box>
        <Box render={<dd />}>{workspace.role}</Box>
      </Box>
      {workspace.role !== "editor" ? (
        <Members workspaceId={workspace.id} />
      ) : (
        <Text>Only owners and admins can manage workspace members.</Text>
      )}
    </Box>
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
    <Box render={<section />} xstyle={deskStyles.stack}>
      <Heading render={<h2>Members</h2>} />
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
      {query.isPending && <Box render={<output />}>Loading members…</Box>}
      {query.data?.map((member) => (
        <Box key={member.user.id} xstyle={deskStyles.flat}>
          <Text>
            {member.user.name} · {member.user.email} · {member.role}
          </Text>
          {member.role === "owner" ? (
            <Text>Workspace owner cannot be removed.</Text>
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
        </Box>
      ))}
    </Box>
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

  const initial: typeof InviteForm.Type = { email: "", role: "editor" }

  const form = useForm({
    defaultValues: initial,
    validators: {
      onBlur: Schema.standardSchemaV1(InviteForm),
      onSubmit: Schema.standardSchemaV1(InviteForm),
    },
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
          <label htmlFor="settings-field-1" {...stylex.props(deskStyles.label)}>
            Invitation email
            <Input
              id="settings-field-1"
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
          <label htmlFor="settings-field-2" {...stylex.props(deskStyles.label)}>
            Invite link
            <Input id="settings-field-2" readOnly value={invite.data.url} />
          </label>
          <Button
            variant="outline"
            onClick={() => copy.mutate(invite.data.url)}
          >
            Copy invite link
          </Button>
          {copy.isSuccess && <Box render={<output />}>Invite link copied.</Box>}
          <Text>
            Share this link with the invited member. No email is sent.
          </Text>
        </>
      )}
    </form>
  )
}
