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
      default: "256px minmax(0, 1fr)",
      "@media (max-width: 700px)": "minmax(0, 1fr)",
    },
    minBlockSize: "100dvh",
  },
  sidebarSurface: {
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
  panel: {
    display: "grid",
    gap: 24,
    padding: 24,
    width: "min(540px, calc(100% - 32px))",
    margin: "10vh auto",
    backgroundColor: tokens["--card"],
    border: `1px solid ${tokens["--border"]}`,
    borderRadius: tokens["--radius-xl"],
  },
  sidebar: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    padding: 20,
    paddingBlock: 28,
    backgroundColor: tokens["--sidebar"],
    borderInlineEnd: `1px solid ${tokens["--border"]}`,
    "@media (max-width: 700px)": { gap: 16, paddingBlock: 20 },
  },
  navigation: {
    gap: 6,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      "@media (max-width: 700px)": "repeat(2, minmax(0, 1fr))",
    },
  },
  footer: {
    display: "grid",
    marginBlockStart: "auto",
    paddingBlockStart: 20,
    borderBlockStart: `1px solid ${tokens["--border"]}`,
    gap: 12,
  },
  content: {
    width: "100%",
    maxWidth: 1280,
    marginInline: "auto",
    padding: { default: 36, "@media (max-width: 700px)": 18 },
  },
  pageHeader: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
    paddingBlockEnd: 24,
    borderBlockEnd: `1px solid ${tokens["--border"]}`,
    marginBlockEnd: 8,
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
    region?:
      | "panel"
      | "sidebar"
      | "navigation"
      | "footer"
      | "content"
      | "pageHeader"
    padding?: "comfortable" | "spacious" | "responsive"
  }
>

export function Box({
  render,
  layout,
  surface,
  region,
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
          surface === "sidebar" && styles.sidebarSurface,
          surface && surface !== "sidebar" && styles[surface],
          region && styles[region],
          padding && styles[padding],
          xstyle,
        ),
        "data-slot": "box",
      },
      props,
    ),
  })
}
