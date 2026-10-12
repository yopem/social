"use client"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

const styles = stylex.create({
  title: { fontSize: "1.75rem", fontWeight: 650, letterSpacing: "-0.03em" },
})

export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6"

export type HeadingProps = StyleXComponentProps<
  useRender.ComponentProps<"h2">,
  { size?: "title" }
>

export function Heading({
  render,
  size,
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
      {
        ...stylexProps(className, size === "title" && styles.title, xstyle),
        "data-slot": "heading",
      },
      props,
    ),
  })
}
