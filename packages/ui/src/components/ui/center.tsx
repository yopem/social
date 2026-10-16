"use client"

import type { ComponentPropsWithoutRef, RefAttributes } from "react"

import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/ui/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    justifyContent: "center",
  },
})

type CenterElementProps = ComponentPropsWithoutRef<"div"> &
  RefAttributes<HTMLDivElement>

export type CenterProps = StyleXComponentProps<CenterElementProps>

export function Center({
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: CenterProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-slot="center"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
      ref={ref}
    />
  )
}
