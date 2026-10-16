"use client"

import type { ComponentPropsWithoutRef, RefAttributes } from "react"

import { Field as FieldPrimitive } from "@base-ui/react/field"
import { mergeProps } from "@base-ui/react/merge-props"
import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/ui/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import type { StyleXProps } from "ui/lib/stylex"
import { isString, stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  control: {
    backgroundClip: "padding-box",
    backgroundColor: {
      default: tokens["--background"],
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--input, currentColor) 32%, transparent)",
    },
    borderColor: tokens["--input"],
    borderRadius: tokens["--radius-md"],
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px color-mix(in oklab, #000 5%, transparent)",
    display: "inline-flex",
    fontSize: { default: "1rem", "@media (min-width: 640px)": "0.875rem" },
    inlineSize: "100%",
    position: "relative",
    transitionProperty: "box-shadow",
    ":has(:focus-visible)": {
      borderColor: tokens["--ring"],
      boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 24%, transparent)",
    },
    ':has([aria-invalid="true"])': {
      borderColor: "color-mix(in oklab, var(--destructive) 36%, transparent)",
    },
    ':has(:focus-visible):has([aria-invalid="true"])': {
      borderColor: "color-mix(in oklab, var(--destructive) 36%, transparent)",
      boxShadow: "0 0 0 3px color-mix(in oklab, var(--ring) 24%, transparent)",
    },
    ":has(:disabled)": { opacity: 0.64, boxShadow: "none" },
  },
  textarea: {
    color: tokens["--foreground"],
    fieldSizing: "content",
    inlineSize: "100%",
    minBlockSize: {
      default: "5.125rem",
      "@media (min-width: 640px)": "4.375rem",
    },
    outline: "none",
    paddingBlock: "calc(0.375rem - 1px)",
    paddingInline: "calc(0.75rem - 1px)",
    "::placeholder": {
      color:
        "color-mix(in oklab, var(--muted-foreground, currentColor) 72%, transparent)",
    },
  },
  small: {
    minBlockSize: {
      default: "4.875rem",
      "@media (min-width: 640px)": "4.125rem",
    },
    paddingBlock: "calc(0.25rem - 1px)",
    paddingInline: "calc(0.625rem - 1px)",
  },
  large: {
    minBlockSize: {
      default: "5.375rem",
      "@media (min-width: 640px)": "4.625rem",
    },
    paddingBlock: "calc(0.5rem - 1px)",
  },
})

export type TextareaProps = StyleXComponentProps<
  ComponentPropsWithoutRef<"textarea"> & RefAttributes<HTMLTextAreaElement>,
  {
    size?: "sm" | "default" | "lg" | number
    unstyled?: boolean
    controlXstyle?: StyleXProps["xstyle"]
  }
>

export function Textarea({
  xstyle: consumerXstyle,
  controlXstyle,
  className,
  size = "default",
  unstyled = false,
  ref,
  ...restProps
}: TextareaProps) {
  const props = restProps
  const xstyle = consumerXstyle

  const sizeStyle =
    size === "sm" ? styles.small : size === "lg" ? styles.large : null

  const wrapperClassName = isString(className) ? className : undefined

  return (
    <Box
      render={<span />}
      {...stylexProps(
        wrapperClassName,
        !unstyled && styles.control,
        controlXstyle,
      )}
      data-size={size}
      data-slot="textarea-control"
    >
      <FieldPrimitive.Control
        ref={ref}
        value={props.value}
        defaultValue={props.defaultValue}
        disabled={props.disabled}
        id={props.id}
        name={props.name}
        render={
          <textarea
            data-slot="textarea"
            {...mergeProps(
              stylex.props(styles.textarea, sizeStyle, xstyle),
              props,
            )}
          />
        }
      />
    </Box>
  )
}

export { FieldPrimitive }
