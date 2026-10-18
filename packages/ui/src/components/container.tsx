"use client"

import type { ComponentPropsWithoutRef, RefAttributes } from "react"

import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    inlineSize: "100%",
    marginInline: "auto",
    maxInlineSize: "90rem",
    paddingInline: `calc(${tokens["--spacing"]} * 4)`,
  },
  fluid: { maxInlineSize: "none" },
})

type ContainerElementProps = ComponentPropsWithoutRef<"div"> &
  RefAttributes<HTMLDivElement>

export type ContainerProps = StyleXComponentProps<
  ContainerElementProps,
  { fluid?: boolean }
>

export function Container({
  fluid = false,
  xstyle,
  className,
  ref,
  ...props
}: ContainerProps) {
  return (
    <Box
      data-slot="container"
      {...mergeStylexProps(
        stylexProps(className, styles.root, fluid && styles.fluid, xstyle),
        props,
      )}
      ref={ref}
    />
  )
}
