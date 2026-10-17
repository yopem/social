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
import { Wrap } from "ui/components/ui/wrap"

import { deskStyles } from "@/components/desk-styles"
import { errorMessage } from "@/lib/queries"

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
    <Stack>
      <label
        id={`${id}-label`}
        htmlFor={id}
        {...stylex.props(deskStyles.labelText)}
      >
        {label}
      </label>
      <Select
        items={options}
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
    <Text role="alert">
      {errorMessage(
        error instanceof Error
          ? error
          : new Error("Request failed. Try again."),
      )}
    </Text>
  ) : null
}

const FormIssue = Schema.Struct({ message: Schema.String })

const FormIssues = Schema.Record(Schema.String, Schema.Array(FormIssue))

export function FormErrors({ errors }: { errors: readonly unknown[] }) {
  const messages = errors.flatMap((error) => {
    if (Schema.is(Schema.String)(error)) return [error]

    if (Schema.is(FormIssue)(error)) return [error.message]

    if (Schema.is(FormIssues)(error))
      return Object.values(error)
        .flat()
        .map((issue) => issue.message)

    return ["Check the form fields."]
  })

  return (
    <>
      {[...new Set(messages)].map((message) => (
        <Text role="alert" key={message}>
          {message}
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
    <Box render={<header />} xstyle={deskStyles.pageHeader}>
      <Heading
        render={
          <h1>
            <>{title}</>
          </h1>
        }
      />
      {children && <Wrap>{children}</Wrap>}
    </Box>
  )
}
