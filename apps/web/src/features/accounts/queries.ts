import { mutationOptions, type QueryClient } from "@tanstack/react-query"

import { callRpc } from "rpc/client"

import { execute } from "@/lib/queries"

export function accountDeletionMutation(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: () =>
      execute(
        callRpc((client) => client.AccountDelete({ confirmation: "DELETE" })),
      ),
    retry: false,
    onSuccess: () => {
      queryClient.clear()
      window.location.assign("/")
    },
  })
}
