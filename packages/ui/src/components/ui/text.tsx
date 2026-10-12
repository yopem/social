import type { ComponentProps } from "react"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"

export type TextProps = StyleXComponentProps<ComponentProps<"p">>

export function Text({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: TextProps) {
  return (
    <p
      data-slot="text"
      {...mergeStylexProps(stylexProps(className, consumerXstyle), restProps)}
    />
  )
}
