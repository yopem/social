import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { ApiError } from "rpc/lib/errors"
import { Id, Name } from "rpc/lib/schema"

export const User = Schema.Struct({ id: Id, name: Name, email: Schema.String })

export type User = typeof User.Type

export class AccountRpc extends RpcGroup.make(
  Rpc.make("AccountDelete", {
    payload: { confirmation: Schema.Literal("DELETE") },
    success: Schema.Void,
    error: ApiError,
  }),
) {}
