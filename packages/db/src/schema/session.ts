import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { users } from "db/schema/accounts"

export const appSessions = sqliteTable(
  "app_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessHash: text("access_hash").notNull().unique(),
    refreshHash: text("refresh_hash").notNull().unique(),
    accessExpiresAt: integer("access_expires_at").notNull(),
    refreshExpiresAt: integer("refresh_expires_at").notNull(),
    rotationStartedAt: integer("rotation_started_at"),
    priorAccessHash: text("prior_access_hash"),
    priorRefreshHash: text("prior_refresh_hash"),
    priorExpiresAt: integer("prior_expires_at"),
  },
  (table) => [index("app_sessions_user").on(table.userId)],
)

export const AppSessionsSelect = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  accessHash: Schema.String,
  refreshHash: Schema.String,
  accessExpiresAt: Schema.Int,
  refreshExpiresAt: Schema.Int,
  rotationStartedAt: Schema.NullOr(Schema.Int),
  priorAccessHash: Schema.NullOr(Schema.String),
  priorRefreshHash: Schema.NullOr(Schema.String),
  priorExpiresAt: Schema.NullOr(Schema.Int),
}) satisfies Schema.Codec<typeof appSessions.$inferSelect>

export const AppSessionsInsert = Schema.Struct({
  ...AppSessionsSelect.fields,
  rotationStartedAt: Schema.optional(
    AppSessionsSelect.fields.rotationStartedAt,
  ),
  priorAccessHash: Schema.optional(AppSessionsSelect.fields.priorAccessHash),
  priorRefreshHash: Schema.optional(AppSessionsSelect.fields.priorRefreshHash),
  priorExpiresAt: Schema.optional(AppSessionsSelect.fields.priorExpiresAt),
}) satisfies Schema.Codec<typeof appSessions.$inferInsert>

const Hash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/))

const Timestamp = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
)

export const AppSessionRow = Schema.Struct({
  id: Schema.String.check(Schema.isUUID()),
  userId: Schema.String.check(Schema.isMinLength(1)),
  accessHash: Hash,
  refreshHash: Hash,
  accessExpiresAt: Timestamp,
  refreshExpiresAt: Timestamp,
  rotationStartedAt: Schema.NullOr(Timestamp),
  priorAccessHash: Schema.NullOr(Hash),
  priorRefreshHash: Schema.NullOr(Hash),
  priorExpiresAt: Schema.NullOr(Timestamp),
}) satisfies Schema.Codec<typeof appSessions.$inferSelect>

export const SessionHashes = Schema.Struct({
  accessHash: Schema.optional(Hash),
  refreshHash: Schema.optional(Hash),
})

export const SessionLookup = Schema.Struct({
  ...SessionHashes.fields,
  now: Timestamp,
})
