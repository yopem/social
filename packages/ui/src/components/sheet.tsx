"use client"

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"
import { XIcon } from "lucide-react"

import { Button } from "ui/components/button"
import { ScrollArea } from "ui/components/scroll-area"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

type SheetSide = "right" | "left" | "top" | "bottom"

type SheetVariant = "default" | "inset"

const styles = stylex.create({
  closeIcon: {
    blockSize: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    inlineSize: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    flexShrink: 0,
    pointerEvents: "none",
    opacity: 0.8,
  },
  backdrop: {
    backdropFilter: "blur(4px)",
    backgroundColor: "rgb(0 0 0 / 0.32)",
    inset: 0,
    position: "fixed",
    transitionDuration: "200ms",
    transitionProperty: "all",
    zIndex: 50,
    "[data-ending-style]": { opacity: 0 },
    "[data-starting-style]": { opacity: 0 },
  },
  viewport: { display: "grid", inset: 0, position: "fixed", zIndex: 50 },
  viewportBottom: { gridTemplateRows: "1fr auto", paddingBlockStart: "3rem" },
  viewportTop: { gridTemplateRows: "auto 1fr", paddingBlockEnd: "3rem" },
  viewportLeft: { display: "flex", justifyContent: "flex-start" },
  viewportRight: { display: "flex", justifyContent: "flex-end" },
  viewportInset: { "@media (min-width: 640px)": { padding: "1rem" } },
  popup: {
    backgroundClip: "padding-box",
    backgroundColor: tokens["--popover"],
    color: tokens["--popover-foreground"],
    display: "flex",
    flexDirection: "column",
    inlineSize: "100%",
    maxBlockSize: "100%",
    minBlockSize: 0,

    position: "relative",
    transitionDuration: "200ms",
    transitionProperty: "opacity, translate",
    transitionTimingFunction: "ease-in-out",
    willChange: "transform",
    boxShadow: "0 10px 15px -3px color-mix(in oklab, #000 5%, transparent)",
    "::before": {
      boxShadow: {
        default: "0 1px rgb(0 0 0 / 0.04)",
        [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
          "0 -1px rgb(255 255 255 / 0.06)",
      },
      content: '""',
      inset: 0,
      pointerEvents: "none",
      position: "absolute",
      "@media (max-width: 639px)": { display: "none" },
    },
    "[data-ending-style]": { opacity: 0 },
    "[data-starting-style]": { opacity: 0 },
  },
  popupBottom: {
    borderBlockStartColor: tokens["--border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    gridRowStart: 2,
    "[data-ending-style]": { translate: "0 2rem" },
    "[data-starting-style]": { translate: "0 2rem" },
  },
  popupTop: {
    borderBlockEndColor: tokens["--border"],
    borderBlockEndStyle: "solid",
    borderBlockEndWidth: 1,
    "[data-ending-style]": { translate: "0 -2rem" },
    "[data-starting-style]": { translate: "0 -2rem" },
  },
  popupLeft: {
    borderInlineEndColor: tokens["--border"],
    borderInlineEndStyle: "solid",
    borderInlineEndWidth: 1,
    inlineSize: "calc(100% - 3rem)",
    maxInlineSize: "28rem",
    "[data-ending-style]": { translate: "-2rem 0" },
    "[data-starting-style]": { translate: "-2rem 0" },
  },
  popupRight: {
    borderInlineStartColor: tokens["--border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    gridColumnStart: 2,
    inlineSize: "calc(100% - 3rem)",
    maxInlineSize: "28rem",
    "[data-ending-style]": { translate: "2rem 0" },
    "[data-starting-style]": { translate: "2rem 0" },
  },
  popupInset: {
    "::before": { display: "none" },
    "@media (min-width: 640px)": {
      borderColor: tokens["--border"],
      borderRadius: "var(--radius-md)",
      borderStyle: "solid",
      borderWidth: 1,
    },
  },
  close: {
    insetBlockStart: "0.5rem",
    insetInlineEnd: "0.5rem",
    position: "absolute",
  },
  header: {
    paddingBlockEnd: {
      default: null,
      ':is(:is([data-slot="dialog-popup"], [data-slot="sheet-popup"], [data-slot="drawer-popup"]):has([data-slot$="panel"]) > [data-slot="sheet-header"])':
        "0.75rem",
      "@media (max-width: 639px)": "1rem",
    },
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "1.5rem",
  },
  footer: {
    display: "flex",
    flexDirection: {
      default: "column-reverse",
      "@media (min-width: 640px)": "row",
    },
    gap: "0.5rem",
    paddingInline: "1.5rem",
    borderEndEndRadius: {
      default: null,
      "@media (min-width: 640px)": {
        default: null,
        ':is([data-slot="sheet-popup"][data-variant="inset"] [data-slot="sheet-footer"])':
          "calc(var(--radius-md) - 1px)",
      },
    },
    borderEndStartRadius: {
      default: null,
      "@media (min-width: 640px)": {
        default: null,
        ':is([data-slot="sheet-popup"][data-variant="inset"] [data-slot="sheet-footer"])':
          "calc(var(--radius-md) - 1px)",
      },
    },
    justifyContent: {
      default: null,
      "@media (min-width: 640px)": "flex-end",
    },
  },
  footerDefault: {
    backgroundColor:
      "color-mix(in oklab, var(--muted, transparent) 72%, transparent)",
    borderBlockStartColor: tokens["--border"],
    borderBlockStartStyle: "solid",
    borderBlockStartWidth: 1,
    paddingBlock: "1rem",
  },
  footerBare: {
    paddingBlockStart: {
      default: "1rem",
      ':is(:is([data-slot="dialog-popup"], [data-slot="sheet-popup"], [data-slot="drawer-popup"]):has([data-slot$="panel"]) > [data-slot="sheet-footer"])':
        "0.75rem",
    },
    paddingBlockEnd: "1.5rem",
  },
  title: {
    fontFamily: tokens["--font-heading"],
    fontSize: "1.25rem",
    fontWeight: 600,
    lineHeight: 1,
  },
  description: { color: tokens["--muted-foreground"], fontSize: "0.875rem" },
  panel: {
    paddingBlockStart: {
      default: null,
      ':is(:is([data-slot="dialog-popup"], [data-slot="sheet-popup"], [data-slot="drawer-popup"]):has([data-slot$="header"]) [data-slot="sheet-panel"])':
        "0.25rem",
    },
    paddingBlockEnd: {
      default: null,
      ':is(:is([data-slot="dialog-popup"], [data-slot="sheet-popup"], [data-slot="drawer-popup"]):has([data-slot$="footer"][data-variant="bare"]) [data-slot="sheet-panel"])':
        "0.25rem",
    },
    padding: "1.5rem",
  },
})

const viewportSideStyles = {
  bottom: styles.viewportBottom,
  left: styles.viewportLeft,
  right: styles.viewportRight,
  top: styles.viewportTop,
} as const

const popupSideStyles = {
  bottom: styles.popupBottom,
  left: styles.popupLeft,
  right: styles.popupRight,
  top: styles.popupTop,
} as const

export const Sheet: typeof SheetPrimitive.Root = SheetPrimitive.Root

export const SheetPortal: typeof SheetPrimitive.Portal = SheetPrimitive.Portal

export function SheetTrigger({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<SheetPrimitive.Trigger.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPrimitive.Trigger
      data-slot="sheet-trigger"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export function SheetClose({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<SheetPrimitive.Close.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPrimitive.Close
      data-slot="sheet-close"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export function SheetBackdrop({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<SheetPrimitive.Backdrop.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-backdrop"
      {...mergeStylexProps(
        stylexProps(className, styles.backdrop, xstyle),
        props,
      )}
    />
  )
}

export function SheetViewport({
  xstyle: consumerXstyle,
  className,
  side = "right",
  variant = "default",
  ...restProps
}: StyleXComponentProps<
  SheetPrimitive.Viewport.Props,
  {
    side?: SheetSide
    variant?: SheetVariant
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPrimitive.Viewport
      data-slot="sheet-viewport"
      {...mergeStylexProps(
        stylexProps(
          className,
          styles.viewport,
          viewportSideStyles[side],
          variant === "inset" && styles.viewportInset,
          xstyle,
        ),
        props,
      )}
    />
  )
}

export function SheetPopup({
  xstyle: consumerXstyle,
  className,
  children,
  showCloseButton = true,
  side = "right",
  variant = "default",
  closeProps,
  portalProps,
  ...restProps
}: StyleXComponentProps<
  SheetPrimitive.Popup.Props,
  {
    showCloseButton?: boolean
    side?: SheetSide
    variant?: SheetVariant
    closeProps?: SheetPrimitive.Close.Props
    portalProps?: SheetPrimitive.Portal.Props
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPortal {...portalProps}>
      <SheetBackdrop />
      <SheetViewport side={side} variant={variant}>
        <SheetPrimitive.Popup
          data-side={side}
          data-slot="sheet-popup"
          data-variant={variant}
          {...mergeStylexProps(
            stylexProps(
              className,
              styles.popup,
              popupSideStyles[side],
              variant === "inset" && styles.popupInset,
              xstyle,
            ),
            props,
          )}
        >
          {children}
          {showCloseButton ? (
            <SheetPrimitive.Close
              aria-label="Close"
              render={
                <Button size="icon" variant="ghost" xstyle={styles.close} />
              }
              {...closeProps}
            >
              <XIcon {...stylex.props(styles.closeIcon)} />
            </SheetPrimitive.Close>
          ) : null}
        </SheetPrimitive.Popup>
      </SheetViewport>
    </SheetPortal>
  )
}

export function SheetHeader({
  xstyle: consumerXstyle,
  className,
  render,
  ...restProps
}: StyleXComponentProps<useRender.ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(className, styles.header, xstyle),
    "data-slot": "sheet-header",
  }

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  })
}

export function SheetFooter({
  xstyle: consumerXstyle,
  className,
  variant = "default",
  render,
  ...restProps
}: StyleXComponentProps<
  useRender.ComponentProps<"div">,
  {
    variant?: "default" | "bare"
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(
      className,
      styles.footer,
      variant === "default" ? styles.footerDefault : styles.footerBare,
      xstyle,
    ),
    "data-slot": "sheet-footer",
    "data-variant": variant,
  }

  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  })
}

export function SheetTitle({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<SheetPrimitive.Title.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      {...mergeStylexProps(stylexProps(className, styles.title, xstyle), props)}
    />
  )
}

export function SheetDescription({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<SheetPrimitive.Description.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      {...mergeStylexProps(
        stylexProps(className, styles.description, xstyle),
        props,
      )}
    />
  )
}

export function SheetPanel({
  xstyle: consumerXstyle,
  className,
  scrollFade = true,
  render,
  ...restProps
}: StyleXComponentProps<
  useRender.ComponentProps<"div">,
  { scrollFade?: boolean }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(className, styles.panel, xstyle),
    "data-slot": "sheet-panel",
  }

  const content = useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(defaultProps, props),
    render,
  })

  return (
    <ScrollArea overscrollContain scrollFade={scrollFade}>
      {content}
    </ScrollArea>
  )
}

export {
  SheetPrimitive,
  SheetBackdrop as SheetOverlay,
  SheetPopup as SheetContent,
}
