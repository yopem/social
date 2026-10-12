import { RpcMiddleware } from "@effect/rpc"
import { Context } from "effect"

import type { User } from "rpc/contracts/models"
import { ApiError } from "rpc/contracts/models"

export class CurrentUser extends Context.Tag("social/CurrentUser")<
  CurrentUser,
  User
>() {}

export class Authentication extends RpcMiddleware.Tag<Authentication>()(
  "social/Authentication",
  { failure: ApiError, provides: CurrentUser },
) {}
