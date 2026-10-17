import { Schema } from "effect"

export class ApiError extends Schema.TaggedError<ApiError>()("ApiError", {
  code: Schema.Literals([
    "unauthenticated",
    "forbidden",
    "not-found",
    "invalid-input",
    "not-configured",
    "conflict",
    "upstream-failure",
    "storage-failure",
  ]),
  message: Schema.String,
}) {}
