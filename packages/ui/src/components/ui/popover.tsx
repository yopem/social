"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
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
    borderRadius: {
      default: tokens["--radius-lg"],
      ':has([data-slot="calendar"])': "0.875rem",
    },
    backgroundClip: "padding-box",
    backgroundColor: tokens["--popover"],
    blockSize: "var(--popup-height, auto)",
    borderColor: tokens["--border"],
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 10px 15px -3px color-mix(in oklab, #000 5%, transparent)",
    color: tokens["--popover-foreground"],
    display: "flex",
    inlineSize: "var(--popup-width, auto)",
    outline: "none",
    position: "relative",
    transformOrigin: "var(--transform-origin)",
    transitionProperty: {
      default: "width, height, scale, opacity",
      "[data-instant]": "none",
    },
    opacity: {
      default: null,
      "[data-starting-style]": 0,
    },
    scale: {
      default: null,
      "[data-starting-style]": 0.98,
    },
    "::before": {
      borderRadius: {
        default: "calc(var(--radius-lg, 0.625rem) - 1px)",
        ':has([data-slot="calendar"])': "calc(0.875rem - 1px)",
      },
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
  },
  tooltipPopup: {
    borderRadius: {
      default: tokens["--radius-md"],
      ':has([data-slot="calendar"])': "0.875rem",
    },
    boxShadow: "0 4px 6px -1px color-mix(in oklab, #000 5%, transparent)",
    fontSize: "0.75rem",
    inlineSize: "fit-content",
    textWrap: "balance",
    "::before": {
      borderRadius: {
        default: "calc(var(--radius-md, 0.5rem) - 1px)",
        ':has([data-slot="calendar"])': "calc(0.875rem - 1px)",
      },
    },
  },
  viewport: {
    padding: {
      default: null,
      ':has([data-slot="calendar"])': "0.5rem",
    },
    "--viewport-inline-padding": {
      default: "1rem",
      ':has([data-slot="calendar"])': "0.5rem",
    },
    blockSize: "100%",
    maxBlockSize: "var(--available-height)",
    overflow: "clip",
    paddingBlock: "1rem",
    paddingInline: "var(--viewport-inline-padding)",
    position: "relative",
    inlineSize: "100%",
    transitionProperty: {
      default: null,
      "[data-instant]": "none",
    },
  },
  scrollable: {
    "[data-transitioning]": { overflowY: "clip" },
    overflowY: "auto",
  },
  tooltipViewport: {
    padding: {
      default: null,
      ':has([data-slot="calendar"])': "0.5rem",
    },
    "--viewport-inline-padding": {
      default: "0.5rem",
      ':has([data-slot="calendar"])': "0.5rem",
    },
    paddingBlock: "0.25rem",
  },
  title: { fontSize: "1.125rem", fontWeight: 600, lineHeight: 1 },
  description: { color: tokens["--muted-foreground"], fontSize: "0.875rem" },
})

export const PopoverCreateHandle: typeof PopoverPrimitive.createHandle =
  PopoverPrimitive.createHandle

export const Popover: typeof PopoverPrimitive.Root = PopoverPrimitive.Root

export function PopoverTrigger({
  xstyle: consumerXstyle,
  className,
  children,
  ...restProps
}: StyleXComponentProps<PopoverPrimitive.Trigger.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    >
      {children}
    </PopoverPrimitive.Trigger>
  )
}

export function PopoverPopup({
  xstyle: consumerXstyle,
  children,
  className,
  side = "bottom",
  align = "center",
  sideOffset = 4,
  alignOffset = 0,
  tooltipStyle = false,
  anchor,
  portalProps,
  instant = false,
  ...restProps
}: StyleXComponentProps<
  PopoverPrimitive.Popup.Props,
  {
    portalProps?: PopoverPrimitive.Portal.Props
    side?: PopoverPrimitive.Positioner.Props["side"]
    align?: PopoverPrimitive.Positioner.Props["align"]
    sideOffset?: PopoverPrimitive.Positioner.Props["sideOffset"]
    alignOffset?: PopoverPrimitive.Positioner.Props["alignOffset"]
    tooltipStyle?: boolean
    anchor?: PopoverPrimitive.Positioner.Props["anchor"]
    instant?: boolean
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <PopoverPrimitive.Portal {...portalProps}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        {...stylex.props(styles.positioner)}
        data-instant={instant || undefined}
        data-slot="popover-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-popup"
          {...mergeStylexProps(
            stylexProps(
              className,
              styles.popup,
              tooltipStyle && styles.tooltipPopup,
              xstyle,
            ),
            props,
          )}
        >
          <PopoverPrimitive.Viewport
            {...stylex.props(
              styles.viewport,
              tooltipStyle ? styles.tooltipViewport : styles.scrollable,
            )}
            data-instant={instant || undefined}
            data-slot="popover-viewport"
          >
            {children}
          </PopoverPrimitive.Viewport>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export function PopoverClose({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<PopoverPrimitive.Close.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <PopoverPrimitive.Close
      data-slot="popover-close"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export function PopoverTitle({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<PopoverPrimitive.Title.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      {...mergeStylexProps(stylexProps(className, styles.title, xstyle), props)}
    />
  )
}

export function PopoverDescription({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<PopoverPrimitive.Description.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      {...mergeStylexProps(
        stylexProps(className, styles.description, xstyle),
        props,
      )}
    />
  )
}

export { PopoverPrimitive, PopoverPopup as PopoverContent }
