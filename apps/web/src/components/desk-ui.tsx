import * as stylex from "@stylexjs/stylex"
import { Schema } from "effect"
import { useId, type ReactNode } from "react"

import { Box } from "ui/components/ui/box"
import { Checkbox } from "ui/components/ui/checkbox"
import { Heading } from "ui/components/ui/heading"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "ui/components/ui/select"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"

import { errorMessage } from "@/features/desk/queries"

export const deskStyles = stylex.create({
  stack: { display: "grid", gap: 16, minWidth: 0 },
  label: { display: "grid", gap: 8, fontSize: 14, minWidth: 0 },
  labelText: { fontSize: 14, fontWeight: 500, lineHeight: 1.5 },
  check: { display: "flex", gap: 10, alignItems: "center", minHeight: 44 },
})

export function Choice({
  label,
  value,
  options,
  onChange,
  onBlur,
  disabled = false,
}: {
  label: string
  value: string
  options: readonly { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
  onBlur?: () => void
  disabled?: boolean
}) {
  const id = useId()

  return (
    <Stack spacing="tight">
      <label
        id={`${id}-label`}
        htmlFor={id}
        {...stylex.props(deskStyles.labelText)}
      >
        {label}
      </label>
      <Select
        value={value || null}
        onValueChange={(next) => onChange(next ?? "")}
        disabled={disabled}
      >
        <SelectTrigger id={id} aria-labelledby={`${id}-label`} onBlur={onBlur}>
          <SelectValue placeholder="Choose…" />
        </SelectTrigger>
        <SelectPopup>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectPopup>
      </Select>
    </Stack>
  )
}

export function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label {...stylex.props(deskStyles.check)}>
      <Checkbox
        aria-label={label}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
      />
      {label}
    </label>
  )
}

export function Failure({ error }: { error: unknown }) {
  return error ? (
    <Text role="alert" tone="danger">
      {errorMessage(
        error instanceof Error
          ? error
          : new Error("Request failed. Try again."),
      )}
    </Text>
  ) : null
}

export function FormErrors({ errors }: { errors: readonly unknown[] }) {
  return (
    <>
      {errors.map((error, index) => (
        <Text role="alert" key={index} tone="danger">
          {Schema.is(Schema.String)(error)
            ? error
            : Schema.is(Schema.Struct({ message: Schema.String }))(error)
              ? error.message
              : "Check the form fields."}
        </Text>
      ))}
    </>
  )
}

export function PageHeading({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <Box render={<header />} region="pageHeader">
      <Heading
        render={
          <h1>
            <>{title}</>
          </h1>
        }
        size="title"
      />
      {children}
    </Box>
  )
}
