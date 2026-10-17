import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query"

import { logout, withRpc } from "rpc/client"

import { execute } from "@/lib/queries"

export function sessionQuery() {
  return queryOptions({
    queryKey: ["session"],
    queryFn: ({ signal }) =>
      execute(
        withRpc((client) => client.SessionRead(undefined)),
        signal,
      ),
    enabled: typeof window !== "undefined",
    retry: false,
  })
}

export function logoutMutation(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: () => execute(logout()),
    onSuccess: () => queryClient.clear(),
  })
}
