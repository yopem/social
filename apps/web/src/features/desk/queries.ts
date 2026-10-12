import {
  mutationOptions,
  queryOptions,
  type QueryClient,
} from "@tanstack/react-query"
import { Cause, Effect, Exit } from "effect"

import { logout, uploadMedia, withRpc, type AppClient } from "rpc/client"

export async function execute<A, E>(
  effect: Effect.Effect<A, E>,
  signal?: AbortSignal,
) {
  const result = await Effect.runPromiseExit(effect, { signal })
  if (Exit.isFailure(result)) throw Cause.squash(result.cause)
  return result.value
}

export function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return Cause.pretty(Cause.die(error))
}

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

export function workspaceQuery<A, E>(
  workspaceId: string,
  name: string,
  call: (client: AppClient) => Effect.Effect<A, E>,
  suffix = "",
) {
  return queryOptions({
    queryKey: ["workspace", workspaceId, name, suffix],
    queryFn: ({ signal }) => execute(withRpc(call), signal),
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
      execute(withRpc((client) => call(client, input))),
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

export function mediaMutation(workspaceId: string) {
  return mutationOptions({
    mutationFn: (file: File) => execute(uploadMedia(workspaceId, file)),
    retry: false,
  })
}

export function logoutMutation(queryClient: QueryClient) {
  return mutationOptions({
    mutationFn: () => execute(logout()),
    onSuccess: () => queryClient.clear(),
  })
}
