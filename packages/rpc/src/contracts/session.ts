import { Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { User } from "rpc/contracts/accounts"
import { Workspace } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"

export const Session = Schema.Struct({
  user: User,
  workspaces: Schema.Array(Workspace),
})

export type Session = typeof Session.Type

export const PublicSession = Schema.Struct({
  user: Schema.NullOr(User),
  workspaces: Schema.Array(Workspace),
})

export type PublicSession = typeof PublicSession.Type

export class SessionRpc extends RpcGroup.make(
  Rpc.make("SessionRead", { success: PublicSession, error: ApiError }),
) {}
