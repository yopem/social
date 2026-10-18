"use client"

import type { ComponentPropsWithoutRef, RefAttributes } from "react"

import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    flexDirection: "row",
    gap: `calc(${tokens["--spacing"]} * 4)`,
  },
})

type HStackElementProps = ComponentPropsWithoutRef<"div"> &
  RefAttributes<HTMLDivElement>

export type HStackProps = StyleXComponentProps<HStackElementProps>

export function HStack({
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: HStackProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-slot="hstack"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
      ref={ref}
    />
  )
}
