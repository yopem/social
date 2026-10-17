import { sql } from "drizzle-orm"
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { posts } from "db/schema/posts"
import { workspaces } from "db/schema/workspaces"
import { Feed } from "rpc/contracts/feeds"

export const feeds = sqliteTable(
  "feeds",
  {
    id: text("id").primaryKey(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    data: text("data").notNull(),
    last_checked_at: text("last_checked_at"),
  },
  (table) => [
    index("feeds_checked").on(table.last_checked_at),
    check("feeds_check_0", sql`json_valid(data)`),
  ],
)

export const feedItems = sqliteTable(
  "feed_items",
  {
    feed_id: text("feed_id")
      .notNull()
      .references(() => feeds.id, { onDelete: "cascade" }),
    item_key: text("item_key").notNull(),
    claimed_at: text("claimed_at").notNull(),
    post_id: text("post_id").references(() => posts.id, {
      onDelete: "set null",
    }),
  },
  (table) => [primaryKey({ columns: [table.feed_id, table.item_key] })],
)

export const FeedsSelect = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  data: Schema.String,
  last_checked_at: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof feeds.$inferSelect>

export const FeedsInsert = Schema.Struct({
  ...FeedsSelect.fields,
  last_checked_at: Schema.optional(FeedsSelect.fields.last_checked_at),
}) satisfies Schema.Codec<typeof feeds.$inferInsert>

export const FeedItemsSelect = Schema.Struct({
  feed_id: Schema.String,
  item_key: Schema.String,
  claimed_at: Schema.String,
  post_id: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof feedItems.$inferSelect>

export const FeedItemsInsert = Schema.Struct({
  ...FeedItemsSelect.fields,
  post_id: Schema.optional(FeedItemsSelect.fields.post_id),
}) satisfies Schema.Codec<typeof feedItems.$inferInsert>

export const FeedRow = Schema.Struct({
  data: Schema.fromJsonString(Feed),
})
