import { DateTime, Option, Schema } from "effect"
import { Rpc, RpcGroup } from "effect/rpc"

import { User } from "rpc/contracts/accounts"
import { ApiError } from "rpc/lib/errors"
import { Id, Name } from "rpc/lib/schema"

export const Role = Schema.Literals(["owner", "admin", "editor"])

export type Role = typeof Role.Type

export const WorkspaceKind = Schema.Literals(["personal", "organization"])

export const Workspace = Schema.Struct({
  id: Id,
  name: Name,
  kind: WorkspaceKind,
  timezone: Name,
  role: Role,
})

export type Workspace = typeof Workspace.Type

export const Member = Schema.Struct({
  user: User,
  role: Role,
})

export type Member = typeof Member.Type

export const WorkspaceInput = Schema.Struct({ workspaceId: Id })

export const WorkspaceTimezone = Name.check(
  Schema.makeFilter((value) => Option.isSome(DateTime.zoneMakeNamed(value)), {
    message: "Enter a valid IANA timezone.",
  }),
)

export const WorkspaceCreateInput = Schema.Struct({
  name: Name,
  kind: WorkspaceKind,
  timezone: WorkspaceTimezone,
})

export const WorkspaceInviteInput = Schema.Struct({
  workspaceId: Id,
  email: Schema.String,
  role: Schema.Literals(["admin", "editor"]),
})

export const WorkspaceAcceptInviteInput = Schema.Struct({ token: Id })

export class WorkspaceRpc extends RpcGroup.make(
  Rpc.make("WorkspaceCreate", {
    payload: WorkspaceCreateInput,
    success: Workspace,
    error: ApiError,
  }),
  Rpc.make("WorkspaceMembers", {
    payload: WorkspaceInput,
    success: Schema.Array(Member),
    error: ApiError,
  }),
  Rpc.make("WorkspaceInvite", {
    payload: WorkspaceInviteInput,
    success: Schema.Struct({ url: Schema.String }),
    error: ApiError,
  }),
  Rpc.make("WorkspaceAcceptInvite", {
    payload: WorkspaceAcceptInviteInput,
    success: Workspace,
    error: ApiError,
  }),
  Rpc.make("WorkspaceTransfer", {
    payload: { workspaceId: Id, memberId: Id },
    success: Schema.Void,
    error: ApiError,
  }),
  Rpc.make("WorkspaceRemoveMember", {
    payload: { workspaceId: Id, userId: Id },
    success: Schema.Void,
    error: ApiError,
  }),
) {}
