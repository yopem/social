"use client"

import type { ComponentPropsWithoutRef, RefAttributes } from "react"

import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

const styles = stylex.create({
  root: { display: "flex" },
})

type FlexElementProps = ComponentPropsWithoutRef<"div"> &
  RefAttributes<HTMLDivElement>

export type FlexProps = StyleXComponentProps<FlexElementProps>

export function Flex({
  xstyle: consumerXstyle,
  className,
  ref,
  ...restProps
}: FlexProps) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "div",
    props: {
      "data-slot": "flex",
      ...mergeStylexProps(stylexProps(className, styles.root, xstyle), props),
    },
    ref,
  })
}
