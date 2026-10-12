"use client"

import type { JSX } from "react"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    minInlineSize: 0,
  },
  split: {
    display: "grid",
    gridTemplateColumns: {
      default: "228px minmax(0, 1fr)",
      "@media (max-width: 700px)": "minmax(0, 1fr)",
    },
    minBlockSize: "100vh",
  },
  sidebar: {
    backgroundColor: tokens["--sidebar"],
    borderInlineEnd: `1px solid ${tokens["--border"]}`,
  },
  divided: {
    borderBlockEnd: `1px solid ${tokens["--border"]}`,
    paddingBlock: `calc(${tokens["--spacing"]} * 5)`,
    overflowWrap: "anywhere",
  },
  preview: {
    padding: `calc(${tokens["--spacing"]} * 4)`,
    backgroundColor: tokens["--muted"],
    borderRadius: tokens["--radius-sm"],
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  comfortable: { padding: `calc(${tokens["--spacing"]} * 5)` },
  spacious: { padding: `calc(${tokens["--spacing"]} * 6)` },
  responsive: {
    padding: {
      default: `calc(${tokens["--spacing"]} * 9)`,
      "@media (max-width: 700px)": `calc(${tokens["--spacing"]} * 4.5)`,
    },
  },
})

export type BoxElement = keyof JSX.IntrinsicElements

export type BoxProps = StyleXComponentProps<
  useRender.ComponentProps<"div">,
  {
    layout?: "split"
    surface?: "sidebar" | "divided" | "preview"
    padding?: "comfortable" | "spacious" | "responsive"
  }
>

export function Box({
  render,
  layout,
  surface,
  padding,
  xstyle,
  className,
  ...props
}: BoxProps) {
  return useRender({
    defaultTagName: "div",
    render,
    props: mergeStylexProps(
      {
        ...stylexProps(
          className,
          styles.root,
          layout === "split" && styles.split,
          surface && styles[surface],
          padding && styles[padding],
          xstyle,
        ),
        "data-slot": "box",
      },
      props,
    ),
  })
}
