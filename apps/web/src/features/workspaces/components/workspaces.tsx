import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { DateTime, Schema } from "effect"
import { useState } from "react"

import type { Workspace } from "rpc/contracts/workspaces"
import { WorkspaceCreateInput as WorkspaceForm } from "rpc/contracts/workspaces"
import { Button } from "ui/components/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/dialog"
import { Field, FieldError } from "ui/components/field"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "ui/components/select"
import { Stack } from "ui/components/stack"

import { deskStyles } from "@/components/desk-styles"
import { Choice, Failure, FormErrors } from "@/components/desk-ui"
import { createWorkspaceMutation } from "@/features/workspaces/queries"

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
    <Stack>
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
            <SelectValue>{selected.name}</SelectValue>
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
    </Stack>
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
      <HStack>
        <DialogTrigger render={<Button variant="outline" />}>
          Create workspace
        </DialogTrigger>
      </HStack>
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

  const mutation = useMutation(createWorkspaceMutation(client))

  const initial: typeof WorkspaceForm.Type = {
    name: "",
    kind: "personal",
    timezone: DateTime.zoneToString(DateTime.zoneMakeLocal()),
  }

  const form = useForm({
    defaultValues: initial,
    validators: {
      onBlur: Schema.toStandardSchemaV1(WorkspaceForm),
      onSubmit: Schema.toStandardSchemaV1(WorkspaceForm),
    },
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
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
            <label
              htmlFor="workspaces-field-1"
              {...stylex.props(deskStyles.label)}
            >
              Workspace name
              <Input
                id="workspaces-field-1"
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
      <form.Field name="kind">
        {(field) => (
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
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
            {field.state.meta.errors.length > 0 && (
              <FieldError match>
                <FormErrors errors={field.state.meta.errors} />
              </FieldError>
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="timezone">
        {(field) => (
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
            <label
              htmlFor="workspaces-field-2"
              {...stylex.props(deskStyles.label)}
            >
              Timezone
              <Input
                id="workspaces-field-2"
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
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => <FormErrors errors={errors} />}
      </form.Subscribe>
      <Failure error={mutation.error} />
      <HStack>
        <Button type="submit" loading={mutation.isPending}>
          Create workspace
        </Button>
      </HStack>
    </form>
  )
}
