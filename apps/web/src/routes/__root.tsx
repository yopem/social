import type { QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"

import * as stylex from "@stylexjs/stylex"
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"

import { themeMarker, lightTheme, rootStyles } from "ui/styles/tokens.stylex"
import "ui/styles/styles.css"

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    validateSearch: (search: Record<string, unknown>) => ({
      workspace:
        typeof search.workspace === "string" ? search.workspace : undefined,
      attempt: typeof search.attempt === "string" ? search.attempt : undefined,
    }),
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
    <html
      lang="en"
      data-theme="light"
      {...stylex.props(themeMarker, lightTheme, rootStyles.html)}
    >
      <head>
        <HeadContent />
      </head>
      <body {...stylex.props(rootStyles.body)}>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
