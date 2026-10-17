import { index, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { User } from "rpc/contracts/accounts"

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    issuer: text("issuer").notNull(),
    subject_id: text("subject_id").notNull(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    initial_workspace_id: text("initial_workspace_id").notNull(),
  },
  (table) => [unique().on(table.issuer, table.subject_id)],
)

export const authAttempts = sqliteTable(
  "auth_attempts",
  {
    state: text("state").primaryKey(),
    nonce_hash: text("nonce_hash").notNull(),
    verifier: text("verifier").notNull(),
    expires_at: text("expires_at").notNull(),
    consumed_at: text("consumed_at"),
  },
  (table) => [index("auth_attempts_expiry").on(table.expires_at)],
)

export const UsersSelect = Schema.Struct({
  id: Schema.String,
  issuer: Schema.String,
  subject_id: Schema.String,
  name: Schema.String,
  email: Schema.String,
  initial_workspace_id: Schema.String,
}) satisfies Schema.Codec<typeof users.$inferSelect>

export const UsersInsert = Schema.Struct({
  ...UsersSelect.fields,
}) satisfies Schema.Codec<typeof users.$inferInsert>

export const AuthAttemptsSelect = Schema.Struct({
  state: Schema.String,
  nonce_hash: Schema.String,
  verifier: Schema.String,
  expires_at: Schema.String,
  consumed_at: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof authAttempts.$inferSelect>

export const AuthAttemptsInsert = Schema.Struct({
  ...AuthAttemptsSelect.fields,
  consumed_at: Schema.optional(AuthAttemptsSelect.fields.consumed_at),
}) satisfies Schema.Codec<typeof authAttempts.$inferInsert>

export const UserRow = User

export const AuthAttempt = Schema.Struct({
  state: Schema.String,
  nonceHash: Schema.String,
  verifier: Schema.String,
  expiresAt: Schema.String,
})

export type AuthAttempt = typeof AuthAttempt.Type

export const ConsumedAuthAttempt = Schema.Struct({
  verifier: AuthAttemptsSelect.fields.verifier,
})
