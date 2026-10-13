"use client"

import type { ComponentProps } from "react"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    color: tokens["--foreground"],
    fontFamily: tokens["--font-sans"],
    fontSize: "1rem",
    fontWeight: 400,
    lineHeight: 1.6,
    margin: 0,
    overflowWrap: "anywhere",
    fontVariantNumeric: "tabular-nums",
  },
  muted: { color: tokens["--muted-foreground"] },
  danger: {
    color: tokens["--destructive-foreground"],
    overflowWrap: "anywhere",
  },
  small: { fontSize: "0.875rem" },
  large: { fontSize: "1.125rem" },
  semibold: { fontWeight: 650 },
  preview: {
    padding: `calc(${tokens["--spacing"]} * 4)`,
    backgroundColor: tokens["--muted"],
    borderRadius: tokens["--radius-sm"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
})

export type TextProps = StyleXComponentProps<
  ComponentProps<"p">,
  {
    tone?: "muted" | "danger"
    size?: "small" | "large"
    weight?: "semibold"
    variant?: "preview"
  }
>

export function Text({
  tone,
  size,
  weight,
  variant,
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: TextProps) {
  return useRender({
    defaultTagName: "p",
    props: {
      "data-slot": "text",
      ...mergeStylexProps(
        stylexProps(
          className,
          styles.root,
          tone && styles[tone],
          size && styles[size],
          weight && styles[weight],
          variant && styles[variant],
          consumerXstyle,
        ),
        restProps,
      ),
    },
    ref,
  })
}
