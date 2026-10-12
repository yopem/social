"use client"

import { useRender } from "@base-ui/react/use-render"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"

export type HeadingProps = StyleXComponentProps<useRender.ComponentProps<"h2">>

export function Heading({
  render,
  xstyle: consumerXstyle,
  className,
  ...restProps
}: HeadingProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "h2",
    render,
    props: mergeStylexProps(
      { ...stylexProps(className, xstyle), "data-slot": "heading" },
      props,
    ),
  })
}
