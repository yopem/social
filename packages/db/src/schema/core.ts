import { sql } from "drizzle-orm"
import {
  check,
  index,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"

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

export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    timezone: text("timezone").notNull(),
  },
  () => [
    check("workspaces_check_0", sql`kind IN ('personal', 'organization')`),
  ],
)

export const memberships = sqliteTable(
  "memberships",
  {
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspace_id, table.user_id] }),
    uniqueIndex("workspace_owner")
      .on(table.workspace_id)
      .where(sql`role = 'owner'`),
    check("memberships_check_0", sql`role IN ('owner', 'admin', 'editor')`),
  ],
)

export const invites = sqliteTable(
  "invites",
  {
    token_hash: text("token_hash").primaryKey(),
    workspace_id: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull(),
    expires_at: text("expires_at").notNull(),
    consumed_by: text("consumed_by").references(() => users.id),
    claim_key: text("claim_key"),
  },
  () => [check("invites_check_0", sql`role IN ('admin', 'editor')`)],
)

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

import { Schema } from "effect"

import {
  Channel,
  Delivery,
  Feed,
  Media,
  PostContent,
  PostState,
  User,
  Workspace,
} from "rpc/contracts/models"

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

export const WorkspacesSelect = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  kind: Schema.String,
  timezone: Schema.String,
}) satisfies Schema.Codec<typeof workspaces.$inferSelect>

export const WorkspacesInsert = Schema.Struct({
  ...WorkspacesSelect.fields,
}) satisfies Schema.Codec<typeof workspaces.$inferInsert>

export const MembershipsSelect = Schema.Struct({
  workspace_id: Schema.String,
  user_id: Schema.String,
  role: Schema.String,
}) satisfies Schema.Codec<typeof memberships.$inferSelect>

export const MembershipsInsert = Schema.Struct({
  ...MembershipsSelect.fields,
}) satisfies Schema.Codec<typeof memberships.$inferInsert>

export const InvitesSelect = Schema.Struct({
  token_hash: Schema.String,
  workspace_id: Schema.String,
  email: Schema.String,
  role: Schema.String,
  expires_at: Schema.String,
  consumed_by: Schema.NullOr(Schema.String),
  claim_key: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof invites.$inferSelect>

export const InvitesInsert = Schema.Struct({
  ...InvitesSelect.fields,
  consumed_by: Schema.optional(InvitesSelect.fields.consumed_by),
  claim_key: Schema.optional(InvitesSelect.fields.claim_key),
}) satisfies Schema.Codec<typeof invites.$inferInsert>

export const ChannelsSelect = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  data: Schema.String,
}) satisfies Schema.Codec<typeof channels.$inferSelect>

export const ChannelsInsert = Schema.Struct({
  ...ChannelsSelect.fields,
}) satisfies Schema.Codec<typeof channels.$inferInsert>

export const MediaSelect = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  object_key: Schema.String,
  data: Schema.String,
}) satisfies Schema.Codec<typeof media.$inferSelect>

export const MediaInsert = Schema.Struct({
  ...MediaSelect.fields,
}) satisfies Schema.Codec<typeof media.$inferInsert>

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

export const WorkspaceRow = Workspace

export const ChannelRow = Schema.Struct({
  data: Schema.fromJsonString(Channel),
})

export const DeliveryRow = Schema.Struct({
  data: Schema.fromJsonString(Delivery),
})

export const FeedRow = Schema.Struct({
  data: Schema.fromJsonString(Feed),
})

export const StoredMedia = Schema.Struct({
  ...Media.fields,
  objectKey: Schema.String,
})

export type StoredMedia = typeof StoredMedia.Type

export const MediaRow = Schema.Struct({
  object_key: MediaSelect.fields.object_key,
  data: Schema.fromJsonString(Media),
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
