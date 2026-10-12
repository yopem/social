"use client"

import type { ComponentProps } from "react"

import { useRender } from "@base-ui/react/use-render"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

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
      ...mergeStylexProps(stylexProps(className, consumerXstyle), restProps),
    },
    ref,
  })
}
