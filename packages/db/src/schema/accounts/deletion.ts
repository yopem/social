import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Schema } from "effect"

import { users } from "db/schema/accounts"
import { workspaces } from "db/schema/workspaces"

export const accountOperations = sqliteTable("account_operations", {
  token: text("token").primaryKey(),
  user_id: text("user_id")
    .notNull()
    .references(() => users.id),
  workspace_id: text("workspace_id").references(() => workspaces.id),
  started_at: text("started_at").notNull(),
})

export const accountDeletions = sqliteTable("account_deletions", {
  user_id: text("user_id")
    .primaryKey()
    .references(() => users.id),
})

export const deletionWorkspaces = sqliteTable("deletion_workspaces", {
  workspace_id: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  user_id: text("user_id")
    .notNull()
    .references(() => accountDeletions.user_id),
})

export const AccountOperationsSelect = Schema.Struct({
  token: Schema.String,
  user_id: Schema.String,
  workspace_id: Schema.NullOr(Schema.String),
  started_at: Schema.String,
}) satisfies Schema.Codec<typeof accountOperations.$inferSelect>

export const AccountOperationsInsert = Schema.Struct({
  ...AccountOperationsSelect.fields,
  workspace_id: Schema.optional(AccountOperationsSelect.fields.workspace_id),
}) satisfies Schema.Codec<typeof accountOperations.$inferInsert>

export const AccountDeletionsSelect = Schema.Struct({
  user_id: Schema.String,
}) satisfies Schema.Codec<typeof accountDeletions.$inferSelect>

export const AccountDeletionsInsert = Schema.Struct({
  ...AccountDeletionsSelect.fields,
}) satisfies Schema.Codec<typeof accountDeletions.$inferInsert>

export const DeletionWorkspacesSelect = Schema.Struct({
  workspace_id: Schema.String,
  user_id: Schema.String,
}) satisfies Schema.Codec<typeof deletionWorkspaces.$inferSelect>

export const DeletionWorkspacesInsert = Schema.Struct({
  ...DeletionWorkspacesSelect.fields,
}) satisfies Schema.Codec<typeof deletionWorkspaces.$inferInsert>

export const AccountDeletionRow = AccountDeletionsSelect

export const DeletionWorkspaceRow = DeletionWorkspacesSelect

export const AccountOperationRow = AccountOperationsSelect
