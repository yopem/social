import { Schema } from "effect"

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export const JsonValueSchema: Schema.Codec<JsonValue> = Schema.suspend(() =>
  Schema.Union([
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(JsonValueSchema),
    Schema.Record(Schema.String, JsonValueSchema),
  ]),
)

export const JsonObject = Schema.Record(Schema.String, JsonValueSchema)

export type JsonObject = typeof JsonObject.Type
