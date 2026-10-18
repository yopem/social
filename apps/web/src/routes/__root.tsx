import type { QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"

import * as stylex from "@stylexjs/stylex"
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router"
import { Schema } from "effect"

import { themeMarker, lightTheme, rootStyles } from "ui/styles/tokens.stylex"
import "@fontsource-variable/inter"
import "@fontsource/ibm-plex-mono/latin-400.css"
import "@fontsource/ibm-plex-mono/latin-500.css"

import "ui/styles/styles.css"

const documentStyles = [themeMarker, lightTheme, rootStyles.html]

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    validateSearch: Schema.toStandardSchemaV1(
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
    <html lang="en" data-theme="light" {...stylex.props(documentStyles)}>
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
