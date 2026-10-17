import { sql } from "drizzle-orm"
import {
  check,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { users } from "db/schema/accounts"
import { Workspace } from "rpc/contracts/workspaces"

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

export const WorkspaceRow = Workspace
