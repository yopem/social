"use client"

import type { ComponentProps } from "react"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import * as stylex from "@stylexjs/stylex"
import { ChevronRightIcon } from "lucide-react"

import { Box } from "ui/components/ui/box"
import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

export const menuSlotStyles = stylex.create({
  icon: {
    blockSize: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    inlineSize: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    flexShrink: 0,
    pointerEvents: "none",
  },
  itemIcon: { marginInline: "-0.125rem", opacity: 0.8 },
})

const styles = stylex.create({
  positioner: { zIndex: 50 },
  popup: {
    backgroundClip: "padding-box",
    backgroundColor: tokens["--popover"],
    borderColor: tokens["--border"],
    borderRadius: tokens["--radius-md"],
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 10px 15px -3px color-mix(in oklab, #000 5%, transparent)",
    display: "flex",
    minInlineSize: "8rem",
    outline: "none",
    position: "relative",
    transformOrigin: "var(--transform-origin)",
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
    ":focus": { outline: "none" },
  },
  popupViewport: {
    inlineSize: "100%",
    maxBlockSize: "var(--available-height)",
    overflowY: "auto",
    padding: "0.25rem",
  },
  item: {
    alignItems: "center",
    borderRadius: tokens["--radius-md"],
    color: tokens["--foreground"],
    cursor: "default",
    display: "flex",
    fontSize: { default: "1rem", "@media (min-width: 640px)": "0.875rem" },
    gap: "0.5rem",
    minBlockSize: { default: "2rem", "@media (min-width: 640px)": "1.75rem" },
    outline: "none",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
    userSelect: "none",
    "[data-highlighted]": {
      backgroundColor: tokens["--accent"],
      color: tokens["--accent-foreground"],
    },
    "[data-variant=destructive]": { color: tokens["--destructive-foreground"] },
    "[data-disabled]": { opacity: 0.64, pointerEvents: "none" },
    "[data-inset]": { paddingInlineStart: "2rem" },
  },
  choiceItem: {
    alignItems: "center",
    borderRadius: tokens["--radius-md"],
    color: tokens["--foreground"],
    cursor: "default",
    display: "grid",
    fontSize: { default: "1rem", "@media (min-width: 640px)": "0.875rem" },
    gap: "0.5rem",
    minBlockSize: { default: "2rem", "@media (min-width: 640px)": "1.75rem" },
    outline: "none",
    paddingBlock: "0.25rem",
    paddingInlineStart: "0.5rem",
    userSelect: "none",
    "[data-highlighted]": {
      backgroundColor: tokens["--accent"],
      color: tokens["--accent-foreground"],
    },
    "[data-disabled]": { opacity: 0.64, pointerEvents: "none" },
  },
  choiceDefault: {
    gridTemplateColumns: "0.75rem 1fr",
    paddingInlineEnd: "1rem",
  },
  choiceSwitch: {
    columnGap: "1rem",
    gridTemplateColumns: "1fr auto",
    paddingInlineEnd: "0.375rem",
  },
  choiceContent: { gridColumnStart: 2 },
  choiceContentFirst: { gridColumnStart: 1 },
  indicator: { gridColumnStart: 1, marginInlineStart: "-0.125rem" },
  switch: {
    alignItems: "center",
    backgroundColor: tokens["--input"],
    blockSize: "calc(var(--thumb-size) + 2px)",
    borderRadius: "9999px",
    boxShadow: "inset 0 1px rgb(0 0 0 / 0.04)",
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: "calc(var(--thumb-size) * 2 - 2px)",
    outline: "none",
    padding: 1,
    transitionDuration: "200ms",
    transitionProperty: "background-color, box-shadow",
    "--thumb-size": { default: "1rem", "@media (min-width: 640px)": "0.75rem" },
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens["--ring"]}, 0 0 0 3px ${tokens["--background"]}`,
    },
    "[data-checked]": { backgroundColor: tokens["--primary"] },
    "[data-disabled]": { opacity: 0.64 },
  },
  switchThumb: {
    borderRadius: {
      default: "var(--thumb-size)",
      ':is([data-slot="menu-checkbox-item"]:active [data-slot="menu-switch-thumb"])':
        "calc(var(--thumb-size) / (var(--thumb-size) * 1.1))",
    },
    scale: {
      default: null,
      ':is([data-slot="menu-checkbox-item"]:active [data-slot="menu-switch-thumb"])':
        "1.1 1",
    },
    transformOrigin: {
      default: "left",
      ':is([data-slot="menu-checkbox-item"][data-checked] [data-slot="menu-switch-thumb"])':
        "var(--thumb-size) 50%",
    },
    translate: {
      default: null,
      ':is([data-slot="menu-checkbox-item"][data-checked] [data-slot="menu-switch-thumb"])':
        "calc(var(--thumb-size) - 4px) 0",
    },
    aspectRatio: "1",
    backgroundColor: tokens["--background"],
    blockSize: "100%",
    boxShadow: "0 1px 2px color-mix(in oklab, #000 5%, transparent)",
    display: "block",
    pointerEvents: "none",
    transition:
      "translate .15s, border-radius .15s, scale .1s .1s, transform-origin .15s",
    willChange: "transform",
  },
  label: {
    color: tokens["--muted-foreground"],
    fontSize: "0.75rem",
    fontWeight: 500,
    paddingBlock: "0.375rem",
    paddingInline: "0.5rem",
    "[data-inset]": {
      paddingInlineStart: {
        default: "2.25rem",
        "@media (min-width: 640px)": "2rem",
      },
    },
  },
  separator: {
    backgroundColor: tokens["--border"],
    blockSize: 1,
    marginBlock: "0.25rem",
    marginInline: "0.5rem",
  },
  shortcut: {
    color: tokens["--muted-foreground"],
    fontFamily: tokens["--font-sans"],
    fontSize: "0.75rem",
    fontWeight: 500,
    letterSpacing: "0.1em",
    marginInlineStart: "auto",
  },
  subTrigger: {
    alignItems: "center",
    borderRadius: tokens["--radius-md"],
    color: tokens["--foreground"],
    display: "flex",
    fontSize: { default: "1rem", "@media (min-width: 640px)": "0.875rem" },
    gap: "0.5rem",
    minBlockSize: { default: "2rem", "@media (min-width: 640px)": "1.75rem" },
    outline: "none",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
    "[data-highlighted]": {
      backgroundColor: tokens["--accent"],
      color: tokens["--accent-foreground"],
    },
    "[data-popup-open]": {
      backgroundColor: tokens["--accent"],
      color: tokens["--accent-foreground"],
    },
    "[data-disabled]": { opacity: 0.64, pointerEvents: "none" },
    "[data-inset]": { paddingInlineStart: "2rem" },
  },
  subIcon: {
    marginInlineEnd: "-0.125rem",
    marginInlineStart: "auto",
    opacity: 0.8,
  },
})

export const MenuCreateHandle: typeof MenuPrimitive.createHandle =
  MenuPrimitive.createHandle

export const Menu: typeof MenuPrimitive.Root = MenuPrimitive.Root

export const MenuPortal: typeof MenuPrimitive.Portal = MenuPrimitive.Portal

export function MenuTrigger({
  xstyle: consumerXstyle,
  className,
  children,
  ...restProps
}: StyleXComponentProps<MenuPrimitive.Trigger.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.Trigger
      data-slot="menu-trigger"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    >
      {children}
    </MenuPrimitive.Trigger>
  )
}

export function MenuPopup({
  xstyle: consumerXstyle,
  children,
  className,
  sideOffset = 4,
  align = "center",
  alignOffset,
  side = "bottom",
  anchor,
  portalProps,
  ...restProps
}: StyleXComponentProps<
  MenuPrimitive.Popup.Props,
  {
    align?: MenuPrimitive.Positioner.Props["align"]
    sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"]
    alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"]
    side?: MenuPrimitive.Positioner.Props["side"]
    anchor?: MenuPrimitive.Positioner.Props["anchor"]
    portalProps?: MenuPrimitive.Portal.Props
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPortal {...portalProps}>
      <MenuPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        {...stylex.props(styles.positioner)}
        data-slot="menu-positioner"
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="menu-popup"
          {...mergeStylexProps(
            stylexProps(className, styles.popup, xstyle),
            props,
          )}
        >
          <Box data-slot={undefined} xstyle={styles.popupViewport}>
            {children}
          </Box>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPortal>
  )
}

export function MenuGroup({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<MenuPrimitive.Group.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.Group
      data-slot="menu-group"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export function MenuItem({
  xstyle: consumerXstyle,
  className,
  inset,
  variant = "default",
  ...restProps
}: StyleXComponentProps<
  MenuPrimitive.Item.Props,
  {
    inset?: boolean
    variant?: "default" | "destructive"
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.Item
      data-inset={inset}
      data-slot="menu-item"
      data-variant={variant}
      {...mergeStylexProps(stylexProps(className, styles.item, xstyle), props)}
    />
  )
}

export function MenuLinkItem({
  xstyle: consumerXstyle,
  className,
  inset,
  variant = "default",
  closeOnClick = true,
  ...restProps
}: StyleXComponentProps<
  MenuPrimitive.LinkItem.Props,
  {
    inset?: boolean
    variant?: "default" | "destructive"
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.LinkItem
      closeOnClick={closeOnClick}
      data-inset={inset}
      data-slot="menu-link-item"
      data-variant={variant}
      {...mergeStylexProps(stylexProps(className, styles.item, xstyle), props)}
    />
  )
}

export function MenuCheckboxItem({
  xstyle: consumerXstyle,
  className,
  children,
  checked,
  variant = "default",
  ...restProps
}: StyleXComponentProps<
  MenuPrimitive.CheckboxItem.Props,
  {
    variant?: "default" | "switch"
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.CheckboxItem
      checked={checked}

      data-slot="menu-checkbox-item"
      data-variant={variant}
      {...mergeStylexProps(
        stylexProps(
          className,
          styles.choiceItem,
          variant === "switch" ? styles.choiceSwitch : styles.choiceDefault,
          xstyle,
        ),
        props,
      )}
    >
      {variant === "switch" ? (
        <>
          <Box
            render={<span />}
            data-slot={undefined}
            xstyle={styles.choiceContentFirst}
          >
            {children}
          </Box>
          <MenuPrimitive.CheckboxItemIndicator
            {...stylex.props(styles.switch)}
            keepMounted
          >
            <Box
              render={<span />}
              xstyle={styles.switchThumb}
              data-slot="menu-switch-thumb"
            />
          </MenuPrimitive.CheckboxItemIndicator>
        </>
      ) : (
        <>
          <MenuPrimitive.CheckboxItemIndicator
            {...stylex.props(styles.indicator)}
          >
            <svg
              {...stylex.props(menuSlotStyles.icon)}
              aria-hidden="true"
              fill="none"
              height="24"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
            </svg>
          </MenuPrimitive.CheckboxItemIndicator>
          <Box
            render={<span />}
            data-slot={undefined}
            xstyle={styles.choiceContent}
          >
            {children}
          </Box>
        </>
      )}
    </MenuPrimitive.CheckboxItem>
  )
}

export function MenuRadioGroup({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<MenuPrimitive.RadioGroup.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.RadioGroup
      data-slot="menu-radio-group"
      {...mergeStylexProps(stylexProps(className, xstyle), props)}
    />
  )
}

export function MenuRadioItem({
  xstyle: consumerXstyle,
  className,
  children,
  ...restProps
}: StyleXComponentProps<MenuPrimitive.RadioItem.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      {...mergeStylexProps(
        stylexProps(className, styles.choiceItem, styles.choiceDefault, xstyle),
        props,
      )}
    >
      <MenuPrimitive.RadioItemIndicator {...stylex.props(styles.indicator)}>
        <svg
          {...stylex.props(menuSlotStyles.icon)}
          aria-hidden="true"
          fill="none"
          height="24"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
        </svg>
      </MenuPrimitive.RadioItemIndicator>
      <Box
        render={<span />}
        data-slot={undefined}
        xstyle={styles.choiceContent}
      >
        {children}
      </Box>
    </MenuPrimitive.RadioItem>
  )
}

export function MenuGroupLabel({
  xstyle: consumerXstyle,
  className,
  inset,
  ...restProps
}: StyleXComponentProps<MenuPrimitive.GroupLabel.Props, { inset?: boolean }>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.GroupLabel
      data-inset={inset}
      data-slot="menu-label"
      {...mergeStylexProps(stylexProps(className, styles.label, xstyle), props)}
    />
  )
}

export function MenuSeparator({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<MenuPrimitive.Separator.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      {...mergeStylexProps(
        stylexProps(className, styles.separator, xstyle),
        props,
      )}
    />
  )
}

export function MenuShortcut({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<ComponentProps<"kbd">>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <kbd
      data-slot="menu-shortcut"
      {...mergeStylexProps(
        stylexProps(className, styles.shortcut, xstyle),
        props,
      )}
    />
  )
}

export function MenuSub(props: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-sub" {...props} />
}

export function MenuSubTrigger({
  xstyle: consumerXstyle,
  className,
  inset,
  children,
  ...restProps
}: StyleXComponentProps<
  MenuPrimitive.SubmenuTrigger.Props,
  { inset?: boolean }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <MenuPrimitive.SubmenuTrigger
      data-inset={inset}
      data-slot="menu-sub-trigger"
      {...mergeStylexProps(
        stylexProps(className, styles.subTrigger, xstyle),
        props,
      )}
    >
      {children}
      <ChevronRightIcon
        {...stylex.props(menuSlotStyles.icon, styles.subIcon)}
      />
    </MenuPrimitive.SubmenuTrigger>
  )
}

export function MenuSubPopup({
  xstyle: consumerXstyle,
  className,
  sideOffset = 0,
  alignOffset,
  align = "start",
  ...restProps
}: StyleXComponentProps<
  MenuPrimitive.Popup.Props,
  {
    align?: MenuPrimitive.Positioner.Props["align"]
    sideOffset?: MenuPrimitive.Positioner.Props["sideOffset"]
    alignOffset?: MenuPrimitive.Positioner.Props["alignOffset"]
  }
>) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultAlignOffset = align !== "center" ? -5 : undefined

  return (
    <MenuPopup
      align={align}
      alignOffset={alignOffset ?? defaultAlignOffset}
      className={className}
      xstyle={xstyle}
      data-slot="menu-sub-content"
      side="inline-end"
      sideOffset={sideOffset}
      {...props}
    />
  )
}

export {
  MenuPrimitive,
  MenuCreateHandle as DropdownMenuCreateHandle,
  Menu as DropdownMenu,
  MenuPortal as DropdownMenuPortal,
  MenuTrigger as DropdownMenuTrigger,
  MenuPopup as DropdownMenuContent,
  MenuGroup as DropdownMenuGroup,
  MenuItem as DropdownMenuItem,
  MenuCheckboxItem as DropdownMenuCheckboxItem,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuRadioItem as DropdownMenuRadioItem,
  MenuGroupLabel as DropdownMenuLabel,
  MenuSeparator as DropdownMenuSeparator,
  MenuShortcut as DropdownMenuShortcut,
  MenuSub as DropdownMenuSub,
  MenuSubTrigger as DropdownMenuSubTrigger,
  MenuSubPopup as DropdownMenuSubContent,
}
