"use client"

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  positioner: {
    blockSize: "var(--positioner-height)",
    inlineSize: "var(--positioner-width)",
    maxInlineSize: "var(--available-width)",
    transitionProperty: "top, left, right, bottom, transform",
    zIndex: 50,
    "[data-instant]": { transitionProperty: "none" },
  },
  popup: {
    backgroundClip: "padding-box",
    backgroundColor: tokens["--popover"],
    blockSize: "var(--popup-height, auto)",
    borderColor: tokens["--border"],
    borderRadius: tokens["--radius-md"],
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 4px 6px -1px color-mix(in oklab, #000 5%, transparent)",
    color: tokens["--popover-foreground"],
    display: "flex",
    fontSize: "0.75rem",
    inlineSize: "var(--popup-width, auto)",
    position: "relative",
    textWrap: "balance",
    transformOrigin: "var(--transform-origin)",
    transitionProperty: "width, height, scale, opacity",
    "::before": {
      borderRadius: "calc(var(--radius-md) - 1px)",
      boxShadow: {
        default: "0 1px rgb(0 0 0 / 0.04)",
        [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
          "0 -1px rgb(255 255 255 / 0.06)",
      },
      content: '""',
      inset: 0,
      pointerEvents: "none",
      position: "absolute",
    },
    "[data-ending-style]": { opacity: 0, scale: 0.98 },
    "[data-instant]": { transitionDuration: "0ms" },
    "[data-starting-style]": { opacity: 0, scale: 0.98 },
  },
  viewport: {
    blockSize: "100%",
    inlineSize: "100%",
    overflow: "clip",
    paddingBlock: "0.25rem",
    paddingInline: "var(--viewport-inline-padding)",
    position: "relative",
    "--viewport-inline-padding": "0.5rem",
    "[data-instant]": { transitionProperty: "none" },
  },
})

export const TooltipCreateHandle: typeof TooltipPrimitive.createHandle =
  TooltipPrimitive.createHandle

export const TooltipProvider: typeof TooltipPrimitive.Provider =
  TooltipPrimitive.Provider

export const Tooltip: typeof TooltipPrimitive.Root = TooltipPrimitive.Root

export function TooltipTrigger({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<TooltipPrimitive.Trigger.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export function TooltipPopup({
  xstyle: consumerXstyle,
  className,
  align = "center",
  sideOffset = 4,
  side = "top",
  anchor,
  children,
  portalProps,
  ...restProps
}: StyleXComponentProps<
  TooltipPrimitive.Popup.Props,
  {
    align?: TooltipPrimitive.Positioner.Props["align"]
    side?: TooltipPrimitive.Positioner.Props["side"]
    sideOffset?: TooltipPrimitive.Positioner.Props["sideOffset"]
    anchor?: TooltipPrimitive.Positioner.Props["anchor"]
    portalProps?: TooltipPrimitive.Portal.Props
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <TooltipPrimitive.Portal {...portalProps}>
      <TooltipPrimitive.Positioner
        align={align}
        anchor={anchor}
        {...stylex.props(styles.positioner)}
        data-slot="tooltip-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-popup"
          {...mergeStylexProps(
            stylexProps(className, styles.popup, xstyle),
            props,
          )}
        >
          <TooltipPrimitive.Viewport
            {...stylex.props(styles.viewport)}
            data-slot="tooltip-viewport"
          >
            {children}
          </TooltipPrimitive.Viewport>
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

export { TooltipPrimitive, TooltipPopup as TooltipContent }
