import { sql } from "drizzle-orm"
import { check, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { workspaces } from "db/schema/workspaces"
import { Channel } from "rpc/contracts/channels"

export const channels = sqliteTable(
  "channels",
  {
    id: text("id").primaryKey(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    data: text("data").notNull(),
  },
  () => [check("channels_check_0", sql`json_valid(data)`)],
)

export const ChannelsSelect = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  data: Schema.String,
}) satisfies Schema.Codec<typeof channels.$inferSelect>

export const ChannelsInsert = Schema.Struct({
  ...ChannelsSelect.fields,
}) satisfies Schema.Codec<typeof channels.$inferInsert>

export const ChannelRow = Schema.Struct({
  data: Schema.fromJsonString(Channel),
})
