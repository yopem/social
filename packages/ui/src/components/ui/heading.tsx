"use client"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    color: tokens["--foreground"],
    fontFamily: tokens["--font-heading"],
    fontSize: {
      default: "1.5rem",
      ":is(h1)": "2.25rem",
      ":is(h3)": "1.25rem",
      ":is(h4)": "1.125rem",
      ":is(h5)": "1rem",
      ":is(h6)": "0.875rem",
    },
    fontWeight: 600,
    lineHeight: 1.25,
    margin: 0,
    letterSpacing: "-0.025em",
    overflowWrap: "anywhere",
    textWrap: "balance",
  },
  title: {
    fontSize: { default: "2rem", "@media (max-width: 700px)": "1.75rem" },
    fontWeight: 650,
    letterSpacing: "-0.035em",
  },
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
        ...stylexProps(
          className,
          styles.root,
          size === "title" && styles.title,
          xstyle,
        ),
        "data-slot": "heading",
      },
      props,
    ),
  })
}
