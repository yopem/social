import type { QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"

import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { Schema } from "effect"

import { Box } from "ui/components/ui/box"
import { themeMarker, lightTheme, rootStyles } from "ui/styles/tokens.stylex"
import "ui/styles/styles.css"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    validateSearch: Schema.decodeUnknownSync(
      Schema.Struct({
        workspace: Schema.optional(Schema.String),
        attempt: Schema.optional(Schema.String),
      }),
    ),
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Publishing desk" },
      ],
    }),
    component: Root,
    shellComponent: Document,
  },
)

export function Root() {
  return <Outlet />
}

export function Document({ children }: { children: ReactNode }) {
  return (
    <Box
      render={<html lang="en" />}
      lang="en"
      data-theme="light"
      xstyle={[themeMarker, lightTheme, rootStyles.html]}
    >
      <Box render={<head />}>
        <HeadContent />
      </Box>
      <Box render={<body />} xstyle={rootStyles.body}>
        {children}
        <Scripts />
      </Box>
    </Box>
  )
}
