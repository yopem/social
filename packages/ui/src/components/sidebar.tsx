"use client"

import type { ComponentProps } from "react"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"
import { PanelLeftIcon } from "lucide-react"
import {
  useSyncExternalStore,
  createContext,
  useContext,
  useState,
} from "react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Input } from "ui/components/input"
import { ScrollArea } from "ui/components/scroll-area"
import { Separator } from "ui/components/separator"
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPopup,
  SheetTitle,
} from "ui/components/sheet"
import { Skeleton } from "ui/components/skeleton"
import { Tooltip, TooltipPopup, TooltipTrigger } from "ui/components/tooltip"
import { useEventCallback } from "ui/hooks/use-event-callback"
import type { StyleXComponentProps } from "ui/lib/stylex"
import {
  isCallback,
  isString,
  mergeStylexProps,
  stylexProps,
} from "ui/lib/stylex"
import { tokens } from "ui/styles/tokens.stylex"

const SIDEBAR_COOKIE_NAME = "sidebar_state"

const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7

const SIDEBAR_WIDTH = "16rem"

const SIDEBAR_WIDTH_MOBILE = "18rem"

const SIDEBAR_WIDTH_ICON = "3rem"

const SIDEBAR_KEYBOARD_SHORTCUT = "b"

export const sidebarSlotStyles = stylex.create({
  icon: { blockSize: "1rem", inlineSize: "1rem", flexShrink: 0 },
  labelIcon: { flexShrink: 0 },
  text: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
})

const styles = stylex.create({
  wrapper: {
    backgroundColor: {
      default: null,
      "@media (min-width: 800px)": {
        default: null,
        ':has([data-slot="sidebar"][data-variant="inset"])':
          tokens["--sidebar"],
      },
    },
    display: "flex",
    inlineSize: "100%",
    minBlockSize: "100svh",
  },
  staticSidebar: {
    backgroundColor: tokens["--sidebar"],
    blockSize: "100%",
    color: tokens["--sidebar-foreground"],
    display: "flex",
    flexDirection: "column",
    inlineSize: "var(--sidebar-width)",
  },
  mobilePopup: {
    backgroundColor: tokens["--sidebar"],
    color: tokens["--sidebar-foreground"],
    inlineSize: "var(--sidebar-width)",
    padding: 0,
  },
  visuallyHidden: {
    blockSize: 1,
    clip: "rect(0, 0, 0, 0)",
    clipPath: "inset(50%)",
    inlineSize: 1,
    margin: -1,
    overflow: "hidden",
    padding: 0,
    position: "absolute",
    whiteSpace: "nowrap",
  },
  mobileContent: {
    blockSize: "100%",
    display: "flex",
    flexDirection: "column",
    inlineSize: "100%",
  },
  desktopRoot: {
    color: tokens["--sidebar-foreground"],
    display: "none",
    "@media (min-width: 800px)": { display: "block" },
  },
  gap: {
    inlineSize: {
      default: "var(--sidebar-width)",
      ':is([data-slot="sidebar"][data-collapsible="offcanvas"] *)': 0,
    },
    rotate: {
      default: null,
      ':is([data-slot="sidebar"][data-side="right"] *)': "180deg",
    },
    backgroundColor: "transparent",
    position: "relative",
    transitionDuration: "200ms",
    transitionProperty: "width",
    transitionTimingFunction: "linear",
  },
  container: {
    inlineSize: {
      default: "var(--sidebar-width)",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)':
        "var(--sidebar-width-icon)",
    },
    blockSize: "100svh",
    display: {
      default: "none",
      "@media (min-width: 800px)": "flex",
    },
    insetBlock: 0,
    position: "fixed",
    transitionDuration: "200ms",
    transitionProperty: "left, right, width",
    transitionTimingFunction: "linear",
    zIndex: 10,
  },
  left: {
    insetInlineStart: {
      default: 0,
      ':is([data-slot="sidebar"][data-collapsible="offcanvas"][data-side="left"] *)':
        "calc(var(--sidebar-width) * -1)",
    },
  },
  right: {
    insetInlineEnd: {
      default: 0,
      ':is([data-slot="sidebar"][data-collapsible="offcanvas"][data-side="right"] *)':
        "calc(var(--sidebar-width) * -1)",
    },
  },
  padded: { padding: "0.5rem" },
  inner: {
    backgroundColor: tokens["--sidebar"],
    blockSize: "100%",
    display: "flex",
    flexDirection: "column",
    inlineSize: "100%",
  },
  trigger: { blockSize: "1.75rem", inlineSize: "1.75rem" },
  triggerIcon: { opacity: 0.8, pointerEvents: "none" },
  rail: {
    blockSize: "auto",
    display: "none",
    inlineSize: "1rem",
    insetBlock: 0,
    position: "absolute",
    transform: "translateX(-50%)",
    transitionProperty: "all",
    transitionTimingFunction: "linear",
    zIndex: 20,
    "::after": {
      blockSize: "100%",
      content: '""',
      inlineSize: 2,
      insetBlock: 0,
      insetInlineStart: "50%",
      position: "absolute",
    },
    "@media (min-width: 640px)": { display: "flex" },
    ":hover": { "::after": { backgroundColor: tokens["--sidebar-border"] } },
  },
  inset: {
    borderRadius: {
      default: null,
      "@media (min-width: 800px)": {
        default: null,
        ':is([data-slot="sidebar"][data-variant="inset"] ~ *)':
          tokens["--radius-md"],
      },
    },
    margin: {
      default: null,
      "@media (min-width: 800px)": {
        default: null,
        ':is([data-slot="sidebar"][data-variant="inset"] ~ *)': "0.5rem",
      },
    },
    marginInlineStart: {
      default: null,
      "@media (min-width: 800px)": {
        default: null,
        ':is([data-slot="sidebar"][data-variant="inset"] ~ *)': 0,
      },
    },
    backgroundColor: tokens["--background"],
    display: "flex",
    flex: 1,
    flexDirection: "column",
    inlineSize: "100%",
    position: "relative",
  },
  input: {
    backgroundColor: tokens["--background"],
    blockSize: "2rem",
    boxShadow: "none",
    inlineSize: "100%",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "0.5rem",
  },
  separator: {
    backgroundColor: tokens["--sidebar-border"],
    inlineSize: "auto",
    marginInline: "0.5rem",
  },
  scrollArea: { flex: 1, minBlockSize: 0 },
  content: {
    overflow: {
      default: null,
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "hidden",
    },
    blockSize: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  group: {
    display: "flex",
    flexDirection: "column",
    inlineSize: "100%",

    padding: "0.5rem",
    position: "relative",
  },
  groupLabel: {
    marginBlockStart: {
      default: null,
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "-2rem",
    },
    opacity: {
      default: null,
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': 0,
    },
    alignItems: "center",
    blockSize: "2rem",
    color: tokens["--sidebar-foreground"],
    display: "flex",
    flexShrink: 0,
    fontSize: "0.75rem",
    fontWeight: 500,
    outline: "none",
    paddingInline: "0.5rem",
    transitionDuration: "200ms",
    transitionProperty: "margin, opacity",
    transitionTimingFunction: "linear",
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 2px ${tokens["--sidebar-ring"]}`,
    },
  },
  groupAction: {
    transitionDuration: "200ms",
    display: {
      default: "flex",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "none",
    },
    alignItems: "center",
    aspectRatio: "1",
    color: {
      default: tokens["--sidebar-foreground"],
      ":hover": tokens["--sidebar-accent-foreground"],
    },
    inlineSize: "1.25rem",
    insetBlockStart: "0.875rem",
    insetInlineEnd: "0.75rem",
    justifyContent: "center",
    outline: "none",
    padding: 0,
    position: "absolute",
    transitionProperty: "transform",
    backgroundColor: {
      default: null,
      ":hover": tokens["--sidebar-accent"],
    },
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 2px ${tokens["--sidebar-ring"]}`,
    },
    "::after": {
      content: '""',
      inset: "-0.5rem",
      position: "absolute",
      display: {
        default: null,
        "@media (min-width: 800px)": "none",
      },
    },
  },
  groupContent: { fontSize: "0.875rem", inlineSize: "100%" },
  menu: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    inlineSize: "100%",
  },
  menuItem: { position: "relative" },
  menuButton: {
    paddingInlineEnd: {
      default: null,
      ':is([data-slot="sidebar-menu-item"]:has([data-sidebar="menu-action"]) *)':
        "2rem",
    },
    alignItems: "center",
    borderRadius: tokens["--radius-md"],
    color: {
      default: tokens["--sidebar-foreground"],
      ":hover": tokens["--sidebar-accent-foreground"],
      ":active": tokens["--sidebar-accent-foreground"],
      "[data-active=true]": tokens["--sidebar-accent-foreground"],
    },
    display: "flex",
    gap: "0.5rem",
    inlineSize: "100%",
    overflow: "hidden",
    outline: "none",
    padding: "0.5rem",
    textAlign: "start",
    transitionProperty: "width, height, padding",
    backgroundColor: {
      default: null,
      ":hover": tokens["--sidebar-accent"],
      ":active": tokens["--sidebar-accent"],
      "[data-active=true]": tokens["--sidebar-accent"],
    },
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 2px ${tokens["--sidebar-ring"]}`,
    },
    opacity: {
      default: null,
      ":disabled": 0.5,
      "[aria-disabled=true]": 0.5,
    },
    pointerEvents: {
      default: null,
      ":disabled": "none",
      "[aria-disabled=true]": "none",
    },
    fontWeight: {
      default: null,
      "[data-active=true]": 500,
    },
  },
  menuButtonDefault: { blockSize: "2rem", fontSize: "0.875rem" },
  menuButtonLarge: { blockSize: "3rem", fontSize: "0.875rem" },
  menuButtonSmall: { blockSize: "1.75rem", fontSize: "0.75rem" },
  menuButtonOutline: {
    backgroundColor: tokens["--background"],
    boxShadow: `0 0 0 1px ${tokens["--sidebar-border"]}`,
    ":hover": { boxShadow: `0 0 0 1px ${tokens["--sidebar-accent"]}` },
  },
  menuAction: {
    insetBlockStart: {
      default: "0.375rem",
      ':is([data-slot="sidebar-menu-button"][data-size="lg"] + *)': "0.625rem",
      ':is([data-slot="sidebar-menu-button"][data-size="default"] + *)':
        "0.375rem",
      ':is([data-slot="sidebar-menu-button"][data-size="sm"] + *)': "0.25rem",
    },
    transitionDuration: "200ms",
    display: {
      default: "flex",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "none",
    },
    alignItems: "center",
    aspectRatio: "1",
    color: {
      default: tokens["--sidebar-foreground"],
      ":hover": tokens["--sidebar-accent-foreground"],
    },
    inlineSize: "1.25rem",
    insetInlineEnd: "0.25rem",
    justifyContent: "center",
    outline: "none",
    padding: 0,
    position: "absolute",
    transitionProperty: "transform",
    backgroundColor: {
      default: null,
      ":hover": tokens["--sidebar-accent"],
    },
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 2px ${tokens["--sidebar-ring"]}`,
    },
    "::after": {
      content: '""',
      inset: "-0.5rem",
      position: "absolute",
      display: {
        default: null,
        "@media (min-width: 800px)": "none",
      },
    },
  },
  menuActionHover: {
    opacity: {
      default: 1,
      ':is([data-slot="sidebar-menu-item"]:hover *, [data-slot="sidebar-menu-item"]:focus-within *)': 1,
      "@media (min-width: 800px)": 0,
      ":focus-within": 1,
      ":hover": 1,
      "[data-state=open]": 1,
    },
  },
  badge: {
    insetBlockStart: {
      default: null,
      ':is([data-slot="sidebar-menu-button"][data-size="lg"] + *)': "0.625rem",
      ':is([data-slot="sidebar-menu-button"][data-size="default"] + *)':
        "0.375rem",
      ':is([data-slot="sidebar-menu-button"][data-size="sm"] + *)': "0.25rem",
    },
    transitionDuration: "200ms",
    display: {
      default: "flex",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "none",
    },
    alignItems: "center",
    blockSize: "1.25rem",
    color: tokens["--sidebar-foreground"],
    fontSize: "0.75rem",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    insetInlineEnd: "0.25rem",
    justifyContent: "center",
    minInlineSize: "1.25rem",
    paddingInline: "0.25rem",
    pointerEvents: "none",
    position: "absolute",
    userSelect: "none",
  },
  skeleton: {
    alignItems: "center",
    blockSize: "2rem",
    display: "flex",
    gap: "0.5rem",
    paddingInline: "0.5rem",
  },
  skeletonIcon: {
    blockSize: "1rem",
    borderRadius: tokens["--radius-md"],
    inlineSize: "1rem",
  },
  widths: (sidebarWidth: string, sidebarWidthIcon: string) => ({
    "--sidebar-width": sidebarWidth,
    "--sidebar-width-icon": sidebarWidthIcon,
  }),
  mobileWidth: { "--sidebar-width": SIDEBAR_WIDTH_MOBILE },
  skeletonText: {
    blockSize: "1rem",
    flex: 1,
    maxInlineSize: "var(--skeleton-width)",
  },
  skeletonWidth: (width: string) => ({ "--skeleton-width": width }),
  menuSub: {
    transitionDuration: "200ms",
    display: {
      default: "flex",
      ':is([data-slot="sidebar"][data-collapsible="icon"] *)': "none",
    },
    borderInlineStartColor: tokens["--sidebar-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 1,
    flexDirection: "column",
    gap: "0.25rem",
    marginInline: "0.875rem",

    paddingBlock: "0.125rem",
    paddingInline: "0.625rem",
    transform: "translateX(1px)",
  },
  subButton: {
    alignItems: "center",
    blockSize: { default: "2rem", "@media (min-width: 640px)": "1.75rem" },
    borderRadius: tokens["--radius-md"],
    color: tokens["--sidebar-foreground"],
    display: "flex",
    gap: "0.5rem",

    outline: "none",
    overflow: "hidden",
    paddingInline: "0.5rem",
    transform: "translateX(-1px)",
    ":hover": {
      backgroundColor: tokens["--sidebar-accent"],
      color: tokens["--sidebar-accent-foreground"],
    },
    ":active": {
      backgroundColor: tokens["--sidebar-accent"],
      color: tokens["--sidebar-accent-foreground"],
    },
    ":focus-visible": { boxShadow: `0 0 0 2px ${tokens["--sidebar-ring"]}` },
    "[data-active=true]": {
      backgroundColor: tokens["--sidebar-accent"],
      color: tokens["--sidebar-accent-foreground"],
    },
  },
  textSmall: { fontSize: "0.75rem" },
  textMedium: { fontSize: "0.875rem" },
})

const menuButtonSizeStyles = {
  default: styles.menuButtonDefault,
  lg: styles.menuButtonLarge,
  sm: styles.menuButtonSmall,
} as const

const menuButtonVariantStyles = {
  default: null,
  outline: styles.menuButtonOutline,
} as const

function useIsMobile() {
  const query = "(max-width: 799px)"

  function subscribe(callback: () => void) {
    const media = window.matchMedia(query)
    media.addEventListener("change", callback)

    return () => media.removeEventListener("change", callback)
  }

  function getSnapshot() {
    return typeof window === "undefined"
      ? false
      : window.matchMedia(query).matches
  }

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

export interface SidebarContextProps {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

export const SidebarContext = createContext<SidebarContextProps | null>(null)

export function useSidebar() {
  const context = useContext(SidebarContext)

  if (!context)
    throw new Error("useSidebar must be used within a SidebarProvider.")

  return context
}

export function SidebarProvider({
  xstyle: consumerXstyle,
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  children,
  ...restProps
}: StyleXComponentProps<
  ComponentProps<"div">,
  {
    defaultOpen?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = useState(false)
  const [_open, _setOpen] = useState(defaultOpen)
  const open = openProp ?? _open

  const setOpen = useEventCallback(
    async (value: boolean | ((value: boolean) => boolean)) => {
      const next = isCallback(value) ? value(open) : value

      if (setOpenProp) setOpenProp(next)
      else _setOpen(next)
      await cookieStore.set({
        expires: Date.now() + SIDEBAR_COOKIE_MAX_AGE * 1000,
        name: SIDEBAR_COOKIE_NAME,
        path: "/",
        value: String(next),
      })
    },
  )

  const toggleSidebar = useEventCallback(() => {
    return isMobile
      ? setOpenMobile((value) => !value)
      : setOpen((value) => !value)
  })

  function registerShortcut(node: HTMLDivElement | null) {
    if (!node) return

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault()
        void toggleSidebar()
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => window.removeEventListener("keydown", handleKeyDown)
  }

  const state: SidebarContextProps["state"] = open ? "expanded" : "collapsed"

  const [contextValue, setContextValue] = useState({
    isMobile,
    open,
    openMobile,
    setOpen,
    setOpenMobile,
    state,
    toggleSidebar,
  })

  if (
    contextValue.isMobile !== isMobile ||
    contextValue.open !== open ||
    contextValue.openMobile !== openMobile
  ) {
    setContextValue({
      isMobile,
      open,
      openMobile,
      setOpen,
      setOpenMobile,
      state,
      toggleSidebar,
    })
  }

  const wrapperProps = mergeProps(
    stylexProps(
      className,
      styles.wrapper,
      styles.widths(SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON),
      xstyle,
    ),
    props,
    { ref: registerShortcut },
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <Box {...wrapperProps} data-slot="sidebar-wrapper">
        {children}
      </Box>
    </SidebarContext.Provider>
  )
}

export function Sidebar({
  xstyle: consumerXstyle,
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  ...restProps
}: StyleXComponentProps<
  ComponentProps<"div">,
  {
    side?: "left" | "right"
    variant?: "sidebar" | "floating" | "inset"
    collapsible?: "offcanvas" | "icon" | "none"
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none")
    return (
      <Box
        data-slot="sidebar"
        {...mergeStylexProps(
          stylexProps(className, styles.staticSidebar, xstyle),
          props,
        )}
      >
        {children}
      </Box>
    )

  if (isMobile)
    return (
      <Sheet onOpenChange={setOpenMobile} open={openMobile}>
        <SheetPopup
          className={className}
          xstyle={[styles.mobilePopup, styles.mobileWidth, xstyle]}
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
          side={side}
          {...props}
        >
          <SheetHeader {...stylex.props(styles.visuallyHidden)}>
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <Box data-slot={undefined} {...stylex.props(styles.mobileContent)}>
            {children}
          </Box>
        </SheetPopup>
      </Sheet>
    )
  const padded = variant === "floating" || variant === "inset"

  return (
    <Box
      {...stylex.props(styles.desktopRoot)}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      <Box {...stylex.props(styles.gap)} data-slot="sidebar-gap" />
      <Box
        data-slot="sidebar-container"
        {...mergeStylexProps(
          stylexProps(
            className,
            styles.container,
            side === "left" ? styles.left : styles.right,
            padded && styles.padded,
            xstyle,
          ),
          props,
        )}
        inert={
          (state === "collapsed" && collapsible === "offcanvas") || props.inert
        }
      >
        <Box
          {...stylex.props(styles.inner)}
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </Box>
      </Box>
    </Box>
  )
}

export function SidebarTrigger({
  xstyle: consumerXstyle,
  className,
  onClick,
  ...restProps
}: StyleXComponentProps<ComponentProps<typeof Button>>) {
  const props = restProps
  const xstyle = consumerXstyle

  const { toggleSidebar } = useSidebar()

  const handleClick = useEventCallback(
    (event: Parameters<NonNullable<typeof onClick>>[0]) => {
      onClick?.(event)
      toggleSidebar()
    },
  )

  return (
    <Button
      className={className}
      xstyle={[styles.trigger, xstyle]}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      onClick={handleClick}
      size="icon"
      variant="ghost"
      {...props}
    >
      <PanelLeftIcon
        {...stylex.props(sidebarSlotStyles.icon, styles.triggerIcon)}
      />
      <Box
        render={<span />}
        data-slot={undefined}
        {...stylex.props(styles.visuallyHidden)}
      >
        Toggle Sidebar
      </Box>
    </Button>
  )
}

export function SidebarRail({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"button">>) {
  const props = restProps
  const xstyle = consumerXstyle

  const { toggleSidebar } = useSidebar()

  return (
    <button
      aria-label="Toggle Sidebar"

      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={toggleSidebar}
      tabIndex={-1}
      title="Toggle Sidebar"
      type="button"
      {...mergeStylexProps(stylexProps(className, styles.rail, xstyle), props)}
    />
  )
}

export function SidebarInset({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"main">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "main",
    props: {
      "data-slot": "sidebar-inset",
      ...mergeStylexProps(stylexProps(className, styles.inset, xstyle), props),
    },
  })
}

export function SidebarInput({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<typeof Input>>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Input
      className={className}
      xstyle={[styles.input, xstyle]}
      data-sidebar="input"
      data-slot="sidebar-input"
      {...props}
    />
  )
}

export function SidebarHeader({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-sidebar="header"
      data-slot="sidebar-header"
      {...mergeStylexProps(
        stylexProps(className, styles.section, xstyle),
        props,
      )}
    />
  )
}

export function SidebarFooter({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-sidebar="footer"
      data-slot="sidebar-footer"
      {...mergeStylexProps(
        stylexProps(className, styles.section, xstyle),
        props,
      )}
    />
  )
}

export function SidebarSeparator({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<typeof Separator>>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Separator
      className={className}
      xstyle={[styles.separator, xstyle]}
      data-sidebar="separator"
      data-slot="sidebar-separator"
      {...props}
    />
  )
}

export function SidebarContent({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <ScrollArea
      className={stylex.props(styles.scrollArea).className}
      fill
      overscrollContain
      scrollFade
    >
      <Box
        data-sidebar="content"
        data-slot="sidebar-content"
        {...mergeStylexProps(
          stylexProps(className, styles.content, xstyle),
          props,
        )}
      />
    </ScrollArea>
  )
}

export function SidebarGroup({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-sidebar="group"
      data-slot="sidebar-group"
      {...mergeStylexProps(stylexProps(className, styles.group, xstyle), props)}
    />
  )
}

export function SidebarGroupLabel({
  xstyle: consumerXstyle,
  className,
  render,
  ...restProps
}: StyleXComponentProps<useRender.ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(className, styles.groupLabel, xstyle),
    "data-sidebar": "group-label",
    "data-slot": "sidebar-group-label",
  }

  return useRender({
    defaultTagName: "div",
    props: mergeProps(defaultProps, props),
    render,
  })
}

export function SidebarGroupAction({
  xstyle: consumerXstyle,
  className,
  render,
  ...restProps
}: StyleXComponentProps<useRender.ComponentProps<"button">>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(className, styles.groupAction, xstyle),
    "data-sidebar": "group-action",
    "data-slot": "sidebar-group-action",
  }

  return useRender({
    defaultTagName: "button",
    props: mergeProps(defaultProps, props),
    render,
  })
}

export function SidebarGroupContent({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-sidebar="group-content"
      data-slot="sidebar-group-content"
      {...mergeStylexProps(
        stylexProps(className, styles.groupContent, xstyle),
        props,
      )}
    />
  )
}

export function SidebarMenu({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"ul">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "ul",
    props: {
      "data-sidebar": "menu",
      "data-slot": "sidebar-menu",
      ...mergeStylexProps(stylexProps(className, styles.menu, xstyle), props),
    },
  })
}

export function SidebarMenuItem({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"li">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "li",
    props: {
      "data-sidebar": "menu-item",
      "data-slot": "sidebar-menu-item",
      ...mergeStylexProps(
        stylexProps(className, styles.menuItem, xstyle),
        props,
      ),
    },
  })
}

export function SidebarMenuButton({
  xstyle: consumerXstyle,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  render,
  ...restProps
}: StyleXComponentProps<
  useRender.ComponentProps<"button">,
  {
    isActive?: boolean
    tooltip?: string | ComponentProps<typeof TooltipPopup>
    variant?: keyof typeof menuButtonVariantStyles | null
    size?: keyof typeof menuButtonSizeStyles | null
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const { isMobile, state } = useSidebar()

  const defaultProps = {
    ...stylexProps(
      className,
      styles.menuButton,
      menuButtonSizeStyles[size ?? "default"],
      menuButtonVariantStyles[variant ?? "default"],
      xstyle,
    ),
    "data-active": isActive,
    "data-sidebar": "menu-button",
    "data-size": size,
    "data-slot": "sidebar-menu-button",
  }

  const buttonElement = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  })

  if (!tooltip) return buttonElement

  const popupProps = isString(tooltip) ? { children: tooltip } : tooltip

  return (
    <Tooltip>
      <TooltipTrigger render={buttonElement} />
      <TooltipPopup
        align="center"
        hidden={state !== "collapsed" || isMobile}
        side="right"
        {...popupProps}
      />
    </Tooltip>
  )
}

export function SidebarMenuAction({
  xstyle: consumerXstyle,
  className,
  showOnHover = false,
  render,
  ...restProps
}: StyleXComponentProps<
  useRender.ComponentProps<"button">,
  {
    showOnHover?: boolean
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(
      className,
      styles.menuAction,
      showOnHover && styles.menuActionHover,
      xstyle,
    ),
    "data-sidebar": "menu-action",
    "data-slot": "sidebar-menu-action",
  }

  return useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(defaultProps, props),
    render,
  })
}

export function SidebarMenuBadge({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <Box
      data-sidebar="menu-badge"
      data-slot="sidebar-menu-badge"
      {...mergeStylexProps(stylexProps(className, styles.badge, xstyle), props)}
    />
  )
}

export function SidebarMenuSkeleton({
  xstyle: consumerXstyle,
  className,
  showIcon = false,
  ...restProps
}: StyleXComponentProps<ComponentProps<"div">, { showIcon?: boolean }>) {
  const props = restProps
  const xstyle = consumerXstyle

  const [width] = useState(() => `${Math.floor(Math.random() * 40) + 50}%`)

  return (
    <Box
      data-sidebar="menu-skeleton"
      data-slot="sidebar-menu-skeleton"
      {...mergeStylexProps(
        stylexProps(className, styles.skeleton, xstyle),
        props,
      )}
    >
      {showIcon ? (
        <Skeleton
          className={stylex.props(styles.skeletonIcon).className}
          data-sidebar="menu-skeleton-icon"
        />
      ) : null}
      <Skeleton
        {...stylexProps(
          undefined,
          styles.skeletonText,
          styles.skeletonWidth(width),
        )}
        data-sidebar="menu-skeleton-text"
      />
    </Box>
  )
}

export function SidebarMenuSub({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"ul">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "ul",
    props: {
      "data-sidebar": "menu-sub",
      "data-slot": "sidebar-menu-sub",
      ...mergeStylexProps(
        stylexProps(className, styles.menuSub, xstyle),
        props,
      ),
    },
  })
}

export function SidebarMenuSubItem({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"li">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "li",
    props: {
      "data-sidebar": "menu-sub-item",
      "data-slot": "sidebar-menu-sub-item",
      ...mergeStylexProps(stylexProps(className, xstyle), props),
    },
  })
}

export function SidebarMenuSubButton({
  xstyle: consumerXstyle,
  size = "md",
  isActive = false,
  className,
  render,
  ...restProps
}: StyleXComponentProps<
  useRender.ComponentProps<"a">,
  {
    size?: "sm" | "md"
    isActive?: boolean
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(
      className,
      styles.subButton,
      size === "sm" ? styles.textSmall : styles.textMedium,
      xstyle,
    ),
    "data-active": isActive,
    "data-sidebar": "menu-sub-button",
    "data-size": size,
    "data-slot": "sidebar-menu-sub-button",
  }

  return useRender({
    defaultTagName: "a",
    props: mergeProps<"a">(defaultProps, props),
    render,
  })
}

export function SidebarMenuText({
  className,
  xstyle: consumerXstyle,
  ...restProps
}: StyleXComponentProps<ComponentProps<"span">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return useRender({
    defaultTagName: "span",
    props: {
      "data-slot": "sidebar-menu-text",
      ...mergeStylexProps(
        stylexProps(className, sidebarSlotStyles.text, xstyle),
        props,
      ),
    },
  })
}
