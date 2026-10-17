import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query"
import { Cause, Effect, Exit } from "effect"

import { callRpc, type AppClient } from "rpc/client"

export async function execute<A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal,
) {
  const result = await Effect.runPromiseExit(effect, { signal })

  if (Exit.isFailure(result)) throw Cause.squash(result.cause)

  return result.value
}

export function errorMessage(error: Error) {
  if (error instanceof Error) return error.message

  return Cause.pretty(Cause.die(error))
}

export function workspaceQuery<A, E>(
  workspaceId: string,
  name: string,
  call: (client: AppClient) => Effect.Effect<A, E>,
  suffix = "",
) {
  return queryOptions({
    queryKey: ["workspace", workspaceId, name, suffix],
    queryFn: ({ signal }) => execute(callRpc(call), signal),
    enabled: typeof window !== "undefined" && workspaceId.length > 0,
    retry: false,
  })
}

export function rpcMutation<Input, A, E>(
  queryClient: QueryClient,
  workspaceId: string,
  call: (client: AppClient, input: Input) => Effect.Effect<A, E>,
) {
  return mutationOptions({
    mutationFn: (input: Input) =>
      execute(callRpc((client) => call(client, input))),
    retry: false,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: workspaceId ? ["workspace", workspaceId] : ["session"],
      }),
  })
}

export function effectMutation<Input, A, E>(
  call: (input: Input) => Effect.Effect<A, E>,
) {
  return mutationOptions({
    mutationFn: (input: Input) => execute(call(input)),
    retry: false,
  })
}
