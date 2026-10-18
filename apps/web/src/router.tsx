import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"

import type { DeskView } from "@/components/desk"

import { routeTree } from "./routeTree.gen"

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 15_000 },
      mutations: { retry: false },
    },
  })

  return createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    Wrap: function QueryProvider({ children }) {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  })
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    deskView?: DeskView
    legalTitle?: string
  }

  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
