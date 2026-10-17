import { sql } from "drizzle-orm"
import { check, sqliteTable, text, unique } from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { workspaces } from "db/schema/workspaces"
import { Media } from "rpc/contracts/media"

export const media = sqliteTable(
  "media",
  {
    id: text("id").primaryKey(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    object_key: text("object_key").notNull(),
    data: text("data").notNull(),
  },
  (table) => [
    unique().on(table.object_key),
    check("media_check_0", sql`json_valid(data)`),
  ],
)

export const MediaSelect = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  object_key: Schema.String,
  data: Schema.String,
}) satisfies Schema.Codec<typeof media.$inferSelect>

export const MediaInsert = Schema.Struct({
  ...MediaSelect.fields,
}) satisfies Schema.Codec<typeof media.$inferInsert>

export const StoredMedia = Schema.Struct({
  ...Media.fields,
  objectKey: Schema.String,
})

export type StoredMedia = typeof StoredMedia.Type

export const MediaRow = Schema.Struct({
  object_key: MediaSelect.fields.object_key,
  data: Schema.fromJsonString(Media),
})
