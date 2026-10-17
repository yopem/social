import { sql } from "drizzle-orm"
import {
  check,
  index,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { channels } from "db/schema/channels"
import { workspaces } from "db/schema/workspaces"
import { Delivery, PostContent, PostState } from "rpc/contracts/posts"

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    state: text("state").notNull(),
    scheduled_at: text("scheduled_at"),
    created_at: text("created_at").notNull(),
    updated_at: text("updated_at").notNull(),
    review_reason: text("review_reason"),
    operation_key: text("operation_key"),
    lease_until: text("lease_until"),
    dispatch_status: text("dispatch_status"),
  },
  (table) => [
    index("posts_lease").on(table.dispatch_status, table.lease_until),
    index("posts_due").on(table.state, table.scheduled_at),
    check("posts_check_0", sql`json_valid(content)`),
    check(
      "posts_check_1",
      sql`state IN (
    'draft', 'scheduled', 'pending', 'published', 'partial', 'failed',
    'needs-review', 'cancelled'
  )`,
    ),
    check(
      "posts_check_2",
      sql`dispatch_status IN (
    'leased', 'enqueued', 'dispatching'
  )`,
    ),
  ],
)

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    post_id: text("post_id")
      .notNull()
      .references(() => posts.id, { onDelete: "cascade" }),
    channel_id: text("channel_id")
      .notNull()
      .references(() => channels.id),
    data: text("data").notNull(),
  },
  (table) => [
    unique().on(table.post_id, table.channel_id),
    check("deliveries_check_0", sql`json_valid(data)`),
  ],
)

export const PostsSelect = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  content: Schema.String,
  state: Schema.String,
  scheduled_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  review_reason: Schema.NullOr(Schema.String),
  operation_key: Schema.NullOr(Schema.String),
  lease_until: Schema.NullOr(Schema.String),
  dispatch_status: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof posts.$inferSelect>

export const PostsInsert = Schema.Struct({
  ...PostsSelect.fields,
  scheduled_at: Schema.optional(PostsSelect.fields.scheduled_at),
  review_reason: Schema.optional(PostsSelect.fields.review_reason),
  operation_key: Schema.optional(PostsSelect.fields.operation_key),
  lease_until: Schema.optional(PostsSelect.fields.lease_until),
  dispatch_status: Schema.optional(PostsSelect.fields.dispatch_status),
}) satisfies Schema.Codec<typeof posts.$inferInsert>

export const DeliveriesSelect = Schema.Struct({
  id: Schema.String,
  post_id: Schema.String,
  channel_id: Schema.String,
  data: Schema.String,
}) satisfies Schema.Codec<typeof deliveries.$inferSelect>

export const DeliveriesInsert = Schema.Struct({
  ...DeliveriesSelect.fields,
}) satisfies Schema.Codec<typeof deliveries.$inferInsert>

export const DeliveryRow = Schema.Struct({
  data: Schema.fromJsonString(Delivery),
})

export const PostRow = Schema.Struct({
  id: PostsSelect.fields.id,
  workspace_id: PostsSelect.fields.workspace_id,
  content: Schema.fromJsonString(PostContent),
  state: PostState,
  scheduled_at: PostsSelect.fields.scheduled_at,
  created_at: PostsSelect.fields.created_at,
  updated_at: PostsSelect.fields.updated_at,
  review_reason: PostsSelect.fields.review_reason,
})
