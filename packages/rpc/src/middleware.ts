import { Context } from "effect"
import { RpcMiddleware } from "effect/rpc"

import type { User } from "rpc/contracts/models"
import { ApiError } from "rpc/contracts/models"

export class CurrentUser extends Context.Service<CurrentUser, User>()(
  "social/CurrentUser",
) {}

export class RequestIdentity extends Context.Service<
  RequestIdentity,
  User | null
>()("social/RequestIdentity") {}

export class Authentication extends RpcMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("social/Authentication", { error: ApiError }) {}
