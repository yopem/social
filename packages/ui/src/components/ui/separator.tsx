import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    backgroundColor: tokens["--border"],
    flexShrink: 0,
  },
  horizontal: { blockSize: 1, inlineSize: "100%" },
  vertical: { alignSelf: "stretch", inlineSize: 1 },
})

export function Separator({
  xstyle: consumerXstyle,
  className,
  orientation = "horizontal",
  ...restProps
}: StyleXComponentProps<SeparatorPrimitive.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SeparatorPrimitive
      data-slot="separator"
      orientation={orientation}
      {...mergeStylexProps(
        stylexProps(
          className,
          styles.root,
          orientation === "horizontal" ? styles.horizontal : styles.vertical,
          xstyle,
        ),
        props,
      )}
    />
  )
}

export { SeparatorPrimitive }
