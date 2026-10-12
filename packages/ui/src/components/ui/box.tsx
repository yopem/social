"use client"

import type { JSX } from "react"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    minInlineSize: 0,
  },
})

export type BoxElement = keyof JSX.IntrinsicElements

export type BoxProps = StyleXComponentProps<useRender.ComponentProps<"div">>

export function Box({ render, xstyle, className, ...props }: BoxProps) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeStylexProps(
      { ...stylexProps(className, styles.root, xstyle), "data-slot": "box" },
      props,
    ),
  })
}
