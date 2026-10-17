import { Schema } from "effect"

export const Id = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(512),
)

export const Name = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(500),
)
