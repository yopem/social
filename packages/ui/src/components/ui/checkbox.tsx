"use client"

import type { ComponentProps } from "react"

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"
import * as stylex from "@stylexjs/stylex"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { mergeStylexProps, stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    alignItems: "center",
    backgroundColor: {
      default: tokens["--background"],
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--input, currentColor) 32%, transparent)",
    },
    blockSize: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    borderColor: {
      default: tokens["--input"],
      "[aria-invalid]":
        "color-mix(in oklab, var(--destructive, currentColor) 36%, transparent)",
    },
    borderRadius: "0.25rem",
    borderStyle: "solid",
    borderWidth: 1,
    boxShadow: "0 1px 2px color-mix(in oklab, #000 5%, transparent)",
    cursor: { default: "default", "[data-disabled]": "not-allowed" },
    display: "inline-flex",
    flexShrink: 0,
    inlineSize: { default: "1.125rem", "@media (min-width: 640px)": "1rem" },
    justifyContent: "center",
    opacity: { default: 1, "[data-disabled]": 0.64 },
    outline: "none",
    position: "relative",
    transitionProperty: "box-shadow",
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens["--ring"]}, 0 0 0 3px ${tokens["--background"]}`,
    },
  },
  indicator: {
    alignItems: "center",
    backgroundColor: {
      default: "transparent",
      "[data-checked]": tokens["--primary"],
    },
    borderRadius: "0.25rem",
    color: {
      default: tokens["--primary-foreground"],
      "[data-indeterminate]": tokens["--foreground"],
    },
    display: { default: "flex", "[data-unchecked]": "none" },
    inset: -1,
    justifyContent: "center",
    position: "absolute",
  },
  icon: {
    blockSize: { default: "0.875rem", "@media (min-width: 640px)": "0.75rem" },
    inlineSize: { default: "0.875rem", "@media (min-width: 640px)": "0.75rem" },
  },
})

function renderIndicator(
  indicatorProps: ComponentProps<"span">,
  state: CheckboxPrimitive.Indicator.State,
) {
  return (
    <span {...indicatorProps}>
      <svg
        aria-hidden="true"
        {...stylex.props(styles.icon)}
        fill="none"
        height="24"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
        viewBox="0 0 24 24"
        width="24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d={
            state.indeterminate
              ? "M5.252 12h13.496"
              : "M5.252 12.7 10.2 18.63 18.748 5.37"
          }
        />
      </svg>
    </span>
  )
}

export function Checkbox({
  xstyle: consumerXstyle,
  className,
  ...restProps
}: StyleXComponentProps<CheckboxPrimitive.Root.Props>) {
  const props = restProps
  const xstyle = consumerXstyle

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      {...mergeStylexProps(stylexProps(className, styles.root, xstyle), props)}
    >
      <CheckboxPrimitive.Indicator
        {...stylex.props(styles.indicator)}
        data-slot="checkbox-indicator"
        render={renderIndicator}
      />
    </CheckboxPrimitive.Root>
  )
}

export { CheckboxPrimitive }
