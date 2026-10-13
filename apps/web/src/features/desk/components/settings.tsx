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
import { Field, FieldError } from "ui/components/ui/field"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"

import {
  Choice,
  Failure,
  FormErrors,
  PageHeading,
  deskStyles,
} from "@/components/desk-ui"
import {
  accountDeletionMutation,
  effectMutation,
  rpcMutation,
  sessionQuery,
  workspaceQuery,
} from "@/features/desk/queries"
import { InviteForm } from "@/features/desk/schema"

export function Settings({ workspace }: { workspace: Workspace }) {
  return (
    <Stack>
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
        <Members
          workspaceId={workspace.id}
          canTransfer={workspace.role === "owner"}
        />
      ) : (
        <Text>Only owners and admins can manage workspace members.</Text>
      )}
      <AccountDeletionSettings />
    </Stack>
  )
}

export function AccountDeletionSettings() {
  const client = useQueryClient()
  const deletion = useMutation(accountDeletionMutation(client))
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState("")

  return (
    <Stack render={<section />}>
      <Heading render={<h2>Delete account</h2>} />
      <Text>
        Delete your account, local credentials, and workspaces where you are the
        only member. Shared workspace data stays for other members. Transfer
        ownership of all shared workspaces first.
      </Text>
      <Text>
        This does not delete posts on social platforms or revoke provider
        access. Remove provider access on each platform. Account deletion cannot
        be undone.
      </Text>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!deletion.isPending) {
            setOpen(value)
            setConfirmation("")
          }
        }}
      >
        <DialogTrigger render={<Button variant="outline" />}>
          Delete account
        </DialogTrigger>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Delete account and data?</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <Stack>
              <Text>
                Your account and sole-member workspace data will be permanently
                deleted.
              </Text>
              <label
                htmlFor="delete-account-confirmation"
                {...stylex.props(deskStyles.label)}
              >
                Type DELETE to confirm
                <Input
                  id="delete-account-confirmation"
                  value={confirmation}
                  disabled={deletion.isPending}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <Failure error={deletion.error} />
              <Button
                disabled={confirmation !== "DELETE" || deletion.isPending}
                loading={deletion.isPending}
                onClick={() => deletion.mutate()}
              >
                Delete account and data
              </Button>
              <Button
                variant="outline"
                disabled={deletion.isPending}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </Stack>
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </Stack>
  )
}

export function Members({
  workspaceId,
  canTransfer,
}: {
  workspaceId: string
  canTransfer: boolean
}) {
  const client = useQueryClient()

  const session = useQuery(sessionQuery())

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

  const transfer = useMutation({
    ...rpcMutation(client, workspaceId, (rpc, memberId: string) =>
      rpc.WorkspaceTransfer({ workspaceId, memberId }),
    ),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["workspace", workspaceId] }),
        client.invalidateQueries({ queryKey: ["session"] }),
      ])
    },
  })

  const [open, setOpen] = useState(false)

  return (
    <Stack render={<section />}>
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
      <Failure error={query.error ?? remove.error ?? transfer.error} />
      {transfer.isSuccess && (
        <Box render={<output />}>Ownership transferred.</Box>
      )}
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isError ? "Retry members" : "Refresh members"}
      </Button>
      {query.isPending && <Box render={<output />}>Loading members…</Box>}
      {query.data?.map((member) => (
        <Box key={member.user.id} surface="divided">
          <Text>
            {member.user.name} · {member.user.email} · {member.role}
          </Text>
          {member.role === "owner" ? (
            <Text>Workspace owner cannot be removed.</Text>
          ) : member.user.id === session.data?.user?.id ? (
            <Text>This is your membership.</Text>
          ) : (
            <>
              {canTransfer && (
                <Button
                  variant="outline"
                  disabled={transfer.isPending || remove.isPending}
                  loading={transfer.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Transfer ownership to ${member.user.name}? You will become an admin and lose owner access.`,
                      )
                    )
                      transfer.mutate(member.user.id)
                  }}
                >
                  Transfer ownership
                </Button>
              )}
              <Button
                variant="outline"
                disabled={remove.isPending || transfer.isPending}
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
            </>
          )}
        </Box>
      ))}
    </Stack>
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
      onBlur: Schema.toStandardSchemaV1(InviteForm),
      onSubmit: Schema.toStandardSchemaV1(InviteForm),
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
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
            <label
              htmlFor="settings-field-1"
              {...stylex.props(deskStyles.label)}
            >
              Invitation email
              <Input
                id="settings-field-1"
                type="email"
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
              />
            </label>
            {field.state.meta.errors.length > 0 && (
              <FieldError match>
                <FormErrors errors={field.state.meta.errors} />
              </FieldError>
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="role">
        {(field) => (
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
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
            {field.state.meta.errors.length > 0 && (
              <FieldError match>
                <FormErrors errors={field.state.meta.errors} />
              </FieldError>
            )}
          </Field>
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
