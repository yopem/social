import type { ComponentProps } from "react"

import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/ui/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

const skeleton = stylex.keyframes({
  to: { backgroundPositionX: "-200%" },
})

const styles = stylex.create({
  root: {
    animationDuration: "2s",
    animationIterationCount: "infinite",
    animationName: skeleton,
    animationTimingFunction: "linear",
    backgroundAttachment: "fixed",
    backgroundColor: tokens["--muted"],
    backgroundImage: {
      default:
        "linear-gradient(120deg, transparent 40%, color-mix(in oklab, #fff 64%, transparent), transparent 60%)",
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "linear-gradient(120deg, transparent 40%, color-mix(in oklab, #fff 4%, transparent), transparent 60%)",
    },
    backgroundPosition: "0 0",
    backgroundSize: "200% 100%",
    borderRadius: tokens["--radius-md"],
  },
})

export function Skeleton({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-slot="skeleton"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
    />
  )
}
