import * as stylex from "@stylexjs/stylex"
import { useId, type ReactNode } from "react"

import { Checkbox } from "ui/components/ui/checkbox"
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "ui/components/ui/select"
import { tokens } from "ui/styles/tokens.stylex"

import { errorMessage } from "../features/desk/queries"

export const deskStyles = stylex.create({
  stack: { display: "grid", gap: 16, minWidth: 0 },
  row: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" },
  flat: {
    borderBottom: `1px solid ${tokens["--border"]}`,
    paddingBlock: 20,
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  muted: { color: tokens["--muted-foreground"], fontSize: 14 },
  title: { fontSize: 28, fontWeight: 650, letterSpacing: "-0.03em" },
  label: { display: "grid", gap: 8, fontSize: 14, minWidth: 0 },
  error: {
    color: tokens["--destructive-foreground"],
    overflowWrap: "anywhere",
  },
  preview: {
    padding: 16,
    backgroundColor: tokens["--muted"],
    borderRadius: 6,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
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
    <div {...stylex.props(deskStyles.label)}>
      <label id={id}>{label}</label>
      <Select
        value={value || null}
        onValueChange={(next) => onChange(next ?? "")}
        disabled={disabled}
      >
        <SelectTrigger aria-labelledby={id} onBlur={onBlur}>
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
    </div>
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
    <p role="alert" {...stylex.props(deskStyles.error)}>
      {errorMessage(error)}
    </p>
  ) : null
}

export function FormErrors({ errors }: { errors: readonly unknown[] }) {
  return (
    <>
      {errors.map((error, index) => (
        <p role="alert" key={index} {...stylex.props(deskStyles.error)}>
          {typeof error === "string"
            ? error
            : error !== null &&
                typeof error === "object" &&
                "message" in error &&
                typeof error.message === "string"
              ? error.message
              : "Check the form fields."}
        </p>
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
    <header {...stylex.props(deskStyles.row)}>
      <h1 {...stylex.props(deskStyles.title)}>{title}</h1>
      {children}
    </header>
  )
}
