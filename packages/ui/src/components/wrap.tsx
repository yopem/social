"use client"

import type { ComponentPropsWithRef } from "react"

import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: `calc(${tokens["--spacing"]} * 2)`,
  },
})

export type WrapProps = StyleXComponentProps<ComponentPropsWithRef<"div">>

export function Wrap({ xstyle, className, ref, ...props }: WrapProps) {
  return (
    <Box
      data-slot="wrap"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
      ref={ref}
    />
  )
}
