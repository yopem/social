"use client"

import type { ComponentProps } from "react"

import { Field as FieldPrimitive } from "@base-ui/react/field"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    alignItems: "flex-start",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    tabSize: 4,
  },
  label: {
    alignItems: "center",
    color: tokens["--foreground"],
    display: "inline-flex",
    fontSize: { default: "1rem", "@media (min-width: 640px)": "0.875rem" },
    fontWeight: 500,
    gap: "0.5rem",
    lineHeight: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    opacity: { default: 1, "[data-disabled]": 0.64 },
  },
  item: { display: "flex" },
  description: {
    color: tokens["--muted-foreground"],
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
  error: {
    color: tokens["--destructive-foreground"],
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
})

export function Field({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<FieldPrimitive.Root.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <FieldPrimitive.Root
      data-slot="field"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
    />
  )
}

export function FieldLabel({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<FieldPrimitive.Label.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      {...mergeStylexProps(stylexProps(className, styles.label, xstyle), props)}
    />
  )
}

export function FieldItem({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<FieldPrimitive.Item.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <FieldPrimitive.Item
      data-slot="field-item"
      {...mergeStylexProps(stylexProps(className, styles.item, xstyle), props)}
    />
  )
}

export function FieldDescription({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<FieldPrimitive.Description.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      {...mergeStylexProps(
        stylexProps(className, styles.description, xstyle),
        props,
      )}
    />
  )
}

export function FieldError({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<FieldPrimitive.Error.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      {...mergeStylexProps(stylexProps(className, styles.error, xstyle), props)}
    />
  )
}

export function FieldControl({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<typeof FieldPrimitive.Control>>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <FieldPrimitive.Control
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export const FieldValidity: typeof FieldPrimitive.Validity =
  FieldPrimitive.Validity

export { FieldPrimitive }
