"use client"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: { display: "flex", minInlineSize: 0 },
  tight: { gap: `calc(${tokens["--spacing"]} * 1.5)` },
  normal: { gap: `calc(${tokens["--spacing"]} * 3)` },
  center: { alignItems: "center" },
  wrap: { flexWrap: "wrap" },
  responsive: {
    flexDirection: { default: "column", "@media (max-width: 700px)": "row" },
  },
})

export type FlexProps = StyleXComponentProps<
  useRender.ComponentProps<"div">,
  {
    spacing?: "tight" | "normal"
    align?: "center"
    wrap?: boolean
    direction?: "responsive"
  }
>

export function Flex({
  render,
  spacing,
  align,
  wrap = false,
  direction,
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: FlexProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "div",
    render,
    props: {
      "data-slot": "flex",
      ...mergeStylexProps(
        stylexProps(
          className,
          styles.root,
          spacing && styles[spacing],
          align === "center" && styles.center,
          wrap && styles.wrap,
          direction === "responsive" && styles.responsive,
          xstyle,
        ),
        props,
      ),
    },
    ref,
  })
}
