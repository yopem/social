import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { ApiError } from "rpc/lib/errors"
import { Id, Name } from "rpc/lib/schema"

export const Media = Schema.Struct({
  id: Id,
  workspaceId: Id,
  name: Name,
  mediaType: Schema.String,
  kind: Schema.Literals(["image", "video"]),
  bytes: Schema.Number,
  url: Schema.String,
})

export type Media = typeof Media.Type

export const MediaListInput = Schema.Struct({
  workspaceId: Id,
  mediaIds: Schema.Array(Id).check(Schema.isMaxLength(20)),
})

export class MediaRpc extends RpcGroup.make(
  Rpc.make("MediaList", {
    payload: MediaListInput,
    success: Schema.Array(Media),
    error: ApiError,
  }),
) {}
