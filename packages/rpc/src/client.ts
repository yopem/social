import type { RpcClientError } from "effect/rpc"

import { Effect, Layer } from "effect"
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientResponse,
} from "effect/http"
import { RpcClient, RpcSerialization } from "effect/rpc"

import { AppRpc } from "rpc/app"
import { Media } from "rpc/contracts/media"
import { ApiError } from "rpc/lib/errors"

export type AppClient = RpcClient.FromGroup<
  typeof AppRpc,
  RpcClientError.RpcClientError
>

export function callRpc<A, E>(
  call: (client: AppClient) => Effect.Effect<A, E>,
  url = "/rpc",
) {
  const transport = RpcClient.layerProtocolHttp({ url }).pipe(
    Layer.provide(
      Layer.merge(FetchHttpClient.layer, RpcSerialization.layerNdjson),
    ),
  )

  return Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(AppRpc)

      return yield* call(client)
    }),
  ).pipe(Effect.provide(transport))
}

export const uploadMedia = Effect.fn("uploadMedia")(
  function* (workspaceId: string, file: File) {
    const client = yield* HttpClient.HttpClient

    const response = yield* client.post(
      `/media/upload?workspace=${encodeURIComponent(workspaceId)}`,
      {
        body: HttpBody.raw(file),
        headers: {
          "content-type": file.type,
          "x-file-name": encodeURIComponent(file.name),
        },
      },
    )

    const accepted = yield* HttpClientResponse.filterStatusOk(response)

    return yield* HttpClientResponse.schemaBodyJson(Media)(accepted)
  },
  Effect.scoped,
  Effect.provide(FetchHttpClient.layer),
  Effect.mapError(
    () =>
      new ApiError({
        code: "upstream-failure",
        message: "Upload failed. Check the file type, size, and permissions.",
      }),
  ),
)

export const logout = Effect.fn("logout")(
  function* () {
    const client = yield* HttpClient.HttpClient
    const response = yield* client.post("/auth/logout")
    yield* HttpClientResponse.filterStatusOk(response)
  },
  Effect.scoped,
  Effect.provide(FetchHttpClient.layer),
)
