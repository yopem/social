"use client"

import type { ComponentPropsWithoutRef, RefAttributes } from "react"

import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: `calc(${tokens["--spacing"]} * 4)`,
  },
})

type StackElementProps = ComponentPropsWithoutRef<"div"> &
  RefAttributes<HTMLDivElement>

export type StackProps = StyleXComponentProps<StackElementProps>

export function Stack({
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: StackProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <div
      data-slot="stack"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
      ref={ref}
    />
  )
}
