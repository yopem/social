import { mutationOptions, type QueryClient } from "@tanstack/react-query"

import { withRpc } from "rpc/client"

import { execute } from "@/lib/queries"

export function accountDeletionMutation(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: () =>
      execute(
        withRpc((client) => client.AccountDelete({ confirmation: "DELETE" })),
      ),
    retry: false,
    onSuccess: () => {
      queryClient.clear()
      window.location.assign("/")
    },
  })
}
