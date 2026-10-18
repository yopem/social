"use client"

import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import * as stylex from "@stylexjs/stylex"
import { clsx } from "clsx"

import type { StyleXComponentProps } from "ui/lib/stylex"
import { stylexProps } from "ui/lib/stylex"
import { themeMarker, tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  root: {
    alignItems: "center",
    borderColor: "transparent",
    borderRadius: tokens["--radius-md"],
    borderStyle: "solid",
    borderWidth: 1,
    display: "inline-flex",
    flexShrink: 0,
    fontWeight: 500,
    gap: "0.25rem",
    justifyContent: "center",
    outline: "none",
    position: "relative",
    transitionProperty: "box-shadow",
    whiteSpace: "nowrap",
    ":disabled": {
      opacity: 0.64,
      pointerEvents: "none",
    },
    ":focus-visible": {
      boxShadow: `0 0 0 2px ${tokens["--ring"]}, 0 0 0 3px ${tokens["--background"]}`,
    },
    cursor: {
      default: null,
      ':is(button[data-slot="badge"])': "pointer",
      ':is(a[data-slot="badge"])': "pointer",
    },
    "::after": {
      blockSize: {
        default: null,
        "@media (pointer: coarse)": {
          default: null,
          ':is(button[data-slot="badge"])': "max(100%, 2.75rem)",
          ':is(a[data-slot="badge"])': "max(100%, 2.75rem)",
        },
      },
      content: {
        default: null,
        "@media (pointer: coarse)": {
          default: null,
          ':is(button[data-slot="badge"])': '""',
          ':is(a[data-slot="badge"])': '""',
        },
      },
      inlineSize: {
        default: null,
        "@media (pointer: coarse)": {
          default: null,
          ':is(button[data-slot="badge"])': "max(100%, 2.75rem)",
          ':is(a[data-slot="badge"])': "max(100%, 2.75rem)",
        },
      },
      inset: {
        default: null,
        "@media (pointer: coarse)": {
          default: null,
          ':is(button[data-slot="badge"])': 0,
          ':is(a[data-slot="badge"])': 0,
        },
      },
      position: {
        default: null,
        "@media (pointer: coarse)": {
          default: null,
          ':is(button[data-slot="badge"])': "absolute",
          ':is(a[data-slot="badge"])': "absolute",
        },
      },
    },
  },
  sizeDefault: {
    blockSize: {
      default: "1.375rem",
      "@media (min-width: 640px)": "1.125rem",
    },
    fontSize: {
      default: "0.875rem",
      "@media (min-width: 640px)": "0.75rem",
    },
    lineHeight: {
      default: "1.25rem",
      "@media (min-width: 640px)": "1rem",
    },
    minInlineSize: {
      default: "1.375rem",
      "@media (min-width: 640px)": "1.125rem",
    },
    paddingInline: "calc(0.25rem - 1px)",
  },
  sizeLarge: {
    blockSize: {
      default: "1.625rem",
      "@media (min-width: 640px)": "1.375rem",
    },
    fontSize: {
      default: "1rem",
      "@media (min-width: 640px)": "0.875rem",
    },
    lineHeight: {
      default: "1.5rem",
      "@media (min-width: 640px)": "1.25rem",
    },
    minInlineSize: {
      default: "1.625rem",
      "@media (min-width: 640px)": "1.375rem",
    },
    paddingInline: "calc(0.375rem - 1px)",
  },
  sizeSmall: {
    blockSize: {
      default: "1.25rem",
      "@media (min-width: 640px)": "1rem",
    },
    borderRadius: "var(--radius-md)",
    fontSize: {
      default: "0.75rem",
      "@media (min-width: 640px)": "0.625rem",
    },
    lineHeight: {
      default: "1rem",
      "@media (min-width: 640px)": "calc(1 / 0.75)",
    },
    minInlineSize: {
      default: "1.25rem",
      "@media (min-width: 640px)": "1rem",
    },
    paddingInline: "calc(0.25rem - 1px)",
  },
  default: {
    backgroundColor: {
      default: tokens["--primary"],
      ':is(button[data-slot="badge"][data-variant="default"]:hover)':
        "color-mix( in oklab, var(--primary, currentColor) 90%, transparent )",
      ':is(a[data-slot="badge"][data-variant="default"]:hover)':
        "color-mix( in oklab, var(--primary, currentColor) 90%, transparent )",
    },
    color: tokens["--primary-foreground"],
  },
  destructive: {
    backgroundColor: {
      default: tokens["--destructive"],
      ':is(button[data-slot="badge"][data-variant="destructive"]:hover)':
        "color-mix( in oklab, var(--destructive, currentColor) 90%, transparent )",
      ':is(a[data-slot="badge"][data-variant="destructive"]:hover)':
        "color-mix( in oklab, var(--destructive, currentColor) 90%, transparent )",
    },
    color: "#fff",
  },
  error: {
    backgroundColor: {
      default:
        "color-mix(in oklab, var(--destructive, currentColor) 8%, transparent)",
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--destructive, currentColor) 16%, transparent)",
    },
    color: tokens["--destructive-foreground"],
  },
  info: {
    backgroundColor: {
      default: "color-mix(in oklab, var(--info, currentColor) 8%, transparent)",
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--info, currentColor) 16%, transparent)",
    },
    color: tokens["--info-foreground"],
  },
  outline: {
    backgroundColor: {
      default: tokens["--background"],
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--input, currentColor) 32%, transparent)",
    },
    borderColor: tokens["--input"],
    color: tokens["--foreground"],
  },
  secondary: {
    backgroundColor: tokens["--secondary"],
    color: tokens["--secondary-foreground"],
  },
  success: {
    backgroundColor: {
      default:
        "color-mix(in oklab, var(--success, currentColor) 8%, transparent)",
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--success, currentColor) 16%, transparent)",
    },
    color: tokens["--success-foreground"],
  },
  warning: {
    backgroundColor: {
      default:
        "color-mix(in oklab, var(--warning, currentColor) 8%, transparent)",
      [stylex.when.ancestor('[data-theme="dark"]', themeMarker)]:
        "color-mix(in oklab, var(--warning, currentColor) 16%, transparent)",
    },
    color: tokens["--warning-foreground"],
  },
})

const sizeStyles = {
  default: styles.sizeDefault,
  lg: styles.sizeLarge,
  sm: styles.sizeSmall,
} as const

const variantStyles = {
  default: styles.default,
  destructive: styles.destructive,
  error: styles.error,
  info: styles.info,
  outline: styles.outline,
  secondary: styles.secondary,
  success: styles.success,
  warning: styles.warning,
} as const

interface BadgeVariantProps {
  className?: string
  size?: keyof typeof sizeStyles
  variant?: keyof typeof variantStyles
}

export function badgeVariants({
  className,
  size = "default",
  variant = "default",
}: BadgeVariantProps = {}) {
  return clsx(
    stylex.props(styles.root, sizeStyles[size], variantStyles[variant])
      .className,
    className,
  )
}

export type BadgeProps = StyleXComponentProps<
  useRender.ComponentProps<"span">,
  {
    variant?: BadgeVariantProps["variant"]
    size?: BadgeVariantProps["size"]
  }
>

export function Badge({
  xstyle: consumerXstyle,
  className,
  variant,
  size,
  render,
  ...restProps
}: BadgeProps) {
  const props = restProps
  const xstyle = consumerXstyle

  const defaultProps = {
    ...stylexProps(
      className,
      styles.root,
      sizeStyles[size ?? "default"],
      variantStyles[variant ?? "default"],
      xstyle,
    ),
    "data-size": size ?? "default",
    "data-slot": "badge",
    "data-variant": variant ?? "default",
  }

  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(defaultProps, props),
    render,
  })
}
