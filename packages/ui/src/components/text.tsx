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
    lineHeight: 1.5,
    margin: 0,
    minInlineSize: 0,
    overflowWrap: "anywhere",
  },
})

export type TextProps = StyleXComponentProps<ComponentProps<"p">>

export function Text({
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
        stylexProps(className, styles.root, consumerXstyle),
        restProps,
      ),
    },
    ref,
  })
}
