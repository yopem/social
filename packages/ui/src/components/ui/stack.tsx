"use client"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    minInlineSize: 0,
  },
  tight: { gap: `calc(${tokens["--spacing"]} * 2)` },
  normal: { gap: `calc(${tokens["--spacing"]} * 4)` },
  loose: { gap: `calc(${tokens["--spacing"]} * 6)` },
})

export type StackProps = StyleXComponentProps<
  useRender.ComponentProps<"div">,
  {
    spacing?: "tight" | "normal" | "loose"
  }
>

export function Stack({
  render,
  spacing = "normal",
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: StackProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "div",
    render,
    props: {
      "data-slot": "stack",
      ...mergeStylexProps(
        stylexProps(className, styles.root, styles[spacing], xstyle),
        props,
      ),
    },
    ref,
  })
}
