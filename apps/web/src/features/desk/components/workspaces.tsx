import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import type { Workspace } from "rpc/contracts/models"
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
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
} from "ui/components/ui/select"

import {
  Choice,
  Failure,
  FormErrors,
  deskStyles,
} from "../../../components/desk-ui"
import { rpcMutation } from "../queries"
import { WorkspaceForm } from "../schema"

export function Workspaces({
  workspaces,
  selected,
  onSelect,
}: {
  workspaces: readonly Workspace[]
  selected?: Workspace
  onSelect: (id: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  return (
    <div {...stylex.props(deskStyles.stack)}>
      {selected && (
        <Select
          value={selected.id}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onValueChange={(id) => {
            if (id) onSelect(id)
          }}
        >
          <SelectTrigger aria-label={`Workspace: ${selected.name}`}>
            {selected.name}
          </SelectTrigger>
          <SelectPopup>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name}
              </SelectItem>
            ))}
            <CreateWorkspace
              onCreated={(id) => {
                setPickerOpen(false)
                onSelect(id)
              }}
            />
          </SelectPopup>
        </Select>
      )}
      {!selected && <CreateWorkspace onCreated={onSelect} />}
    </div>
  )
}

export function CreateWorkspace({
  onCreated,
}: {
  onCreated: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        Create workspace
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Create workspace</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <WorkspaceFields
            onCreated={(id) => {
              setOpen(false)
              onCreated(id)
            }}
          />
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}

export function WorkspaceFields({
  onCreated,
}: {
  onCreated: (id: string) => void
}) {
  const client = useQueryClient()
  const mutation = useMutation(
    rpcMutation(client, "", (rpc, input: typeof WorkspaceForm.Type) =>
      rpc.WorkspaceCreate(input),
    ),
  )
  const form = useForm({
    defaultValues: {
      name: "",
      kind: "personal" as "personal" | "organization",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    validators: { onBlur: WorkspaceForm, onSubmit: WorkspaceForm },
    onSubmit: ({ value }) =>
      mutation.mutate(value, {
        onSuccess: (workspace) => onCreated(workspace.id),
      }),
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
      <form.Field name="name">
        {(field) => (
          <label {...stylex.props(deskStyles.label)}>
            Workspace name
            <Input
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="kind">
        {(field) => (
          <Choice
            label="Workspace type"
            value={field.state.value}
            options={[
              { value: "personal", label: "Personal" },
              { value: "organization", label: "Organization" },
            ]}
            onBlur={field.handleBlur}
            onChange={(value) => {
              if (value === "personal" || value === "organization")
                field.handleChange(value)
            }}
          />
        )}
      </form.Field>
      <form.Field name="timezone">
        {(field) => (
          <label {...stylex.props(deskStyles.label)}>
            Timezone
            <Input
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => <FormErrors errors={errors} />}
      </form.Subscribe>
      <Failure error={mutation.error} />
      <Button type="submit" loading={mutation.isPending}>
        Create workspace
      </Button>
    </form>
  )
}
