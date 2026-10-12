import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core"

export const socialAttempts = sqliteTable(
  "social_attempts",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id").notNull(),
    principal_id: text("principal_id").notNull(),
    platform: text("platform").notNull(),
    state: text("state").notNull(),
    expires_at: text("expires_at").notNull(),
    ciphertext: text("ciphertext").notNull(),
    discovery_claimed: integer("discovery_claimed").notNull().default(0),
    discovery: text("discovery"),
    consumed_token: text("consumed_token"),
  },
  (table) => [unique().on(table.state)],
)

export const socialGrants = sqliteTable(
  "social_grants",
  {
    id: text("id").primaryKey(),
    tenant_id: text("tenant_id").notNull(),
    principal_id: text("principal_id").notNull(),
    backend: text("backend").notNull(),
    platform: text("platform").notNull(),
    account_id: text("account_id").notNull(),
    data: text("data").notNull(),
    revoked: integer("revoked").notNull().default(0),
  },
  (table) => [
    index("social_grants_account").on(
      table.platform,
      table.account_id,
      table.revoked,
    ),
    unique().on(
      table.tenant_id,
      table.backend,
      table.platform,
      table.account_id,
    ),
  ],
)

export const socialCredentials = sqliteTable("social_credentials", {
  key: text("key").primaryKey(),
  revision: text("revision").notNull(),
  ciphertext: text("ciphertext").notNull(),
})

export const socialRefreshLocks = sqliteTable("social_refresh_locks", {
  key: text("key").primaryKey(),
  token: text("token").notNull(),
  expires_at: text("expires_at").notNull(),
})

export const socialIdempotency = sqliteTable(
  "social_idempotency",
  {
    id: text("id").primaryKey(),
    scope: text("scope").notNull(),
    key: text("key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    targets: text("targets").notNull(),
    tenant_id: text("tenant_id"),
    principal_id: text("principal_id"),
  },
  (table) => [unique().on(table.scope, table.key)],
)

export const socialOutcomes = sqliteTable(
  "social_outcomes",
  {
    claim_id: text("claim_id")
      .notNull()
      .references(() => socialIdempotency.id),
    target_key: text("target_key").notNull(),
    data: text("data").notNull(),
  },
  (table) => [primaryKey({ columns: [table.claim_id, table.target_key] })],
)

export const socialWorkflows = sqliteTable("social_workflows", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  data: text("data").notNull(),
  claim_token: text("claim_token"),
  tenant_id: text("tenant_id"),
  principal_id: text("principal_id"),
})

export const socialUploadSessions = sqliteTable("social_upload_sessions", {
  id: text("id").primaryKey(),
  tenant_id: text("tenant_id").notNull(),
  channel_id: text("channel_id").notNull(),
  ciphertext: text("ciphertext").notNull(),
})

export const socialInbox = sqliteTable(
  "social_inbox",
  {
    key: text("key").primaryKey(),
    platform: text("platform").notNull(),
    data: text("data").notNull(),
    tenants: text("tenants").notNull(),
    state: text("state").notNull(),
    received_at: text("received_at").notNull(),
    completed_at: text("completed_at"),
  },
  () => [
    check(
      "social_inbox_check_0",
      sql`state IN ('pending','quarantined','complete')`,
    ),
  ],
)

import { Schema } from "effect"

import { JsonValueSchema } from "rpc/contracts/json"
import { Platform } from "rpc/contracts/models"

export const SocialAttemptsSelect = Schema.Struct({
  id: Schema.String,
  tenant_id: Schema.String,
  principal_id: Schema.String,
  platform: Schema.String,
  state: Schema.String,
  expires_at: Schema.String,
  ciphertext: Schema.String,
  discovery_claimed: Schema.Int,
  discovery: Schema.NullOr(Schema.String),
  consumed_token: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof socialAttempts.$inferSelect>

export const SocialAttemptsInsert = Schema.Struct({
  ...SocialAttemptsSelect.fields,
  discovery_claimed: Schema.optional(
    SocialAttemptsSelect.fields.discovery_claimed,
  ),
  discovery: Schema.optional(SocialAttemptsSelect.fields.discovery),
  consumed_token: Schema.optional(SocialAttemptsSelect.fields.consumed_token),
}) satisfies Schema.Codec<typeof socialAttempts.$inferInsert>

export const SocialGrantsSelect = Schema.Struct({
  id: Schema.String,
  tenant_id: Schema.String,
  principal_id: Schema.String,
  backend: Schema.String,
  platform: Schema.String,
  account_id: Schema.String,
  data: Schema.String,
  revoked: Schema.Int,
}) satisfies Schema.Codec<typeof socialGrants.$inferSelect>

export const SocialGrantsInsert = Schema.Struct({
  ...SocialGrantsSelect.fields,
  revoked: Schema.optional(SocialGrantsSelect.fields.revoked),
}) satisfies Schema.Codec<typeof socialGrants.$inferInsert>

export const SocialCredentialsSelect = Schema.Struct({
  key: Schema.String,
  revision: Schema.String,
  ciphertext: Schema.String,
}) satisfies Schema.Codec<typeof socialCredentials.$inferSelect>

export const SocialCredentialsInsert = Schema.Struct({
  ...SocialCredentialsSelect.fields,
}) satisfies Schema.Codec<typeof socialCredentials.$inferInsert>

export const SocialRefreshLocksSelect = Schema.Struct({
  key: Schema.String,
  token: Schema.String,
  expires_at: Schema.String,
}) satisfies Schema.Codec<typeof socialRefreshLocks.$inferSelect>

export const SocialRefreshLocksInsert = Schema.Struct({
  ...SocialRefreshLocksSelect.fields,
}) satisfies Schema.Codec<typeof socialRefreshLocks.$inferInsert>

export const SocialIdempotencySelect = Schema.Struct({
  id: Schema.String,
  scope: Schema.String,
  key: Schema.String,
  fingerprint: Schema.String,
  targets: Schema.String,
  tenant_id: Schema.NullOr(Schema.String),
  principal_id: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof socialIdempotency.$inferSelect>

export const SocialIdempotencyInsert = Schema.Struct({
  ...SocialIdempotencySelect.fields,
  tenant_id: Schema.optional(SocialIdempotencySelect.fields.tenant_id),
  principal_id: Schema.optional(SocialIdempotencySelect.fields.principal_id),
}) satisfies Schema.Codec<typeof socialIdempotency.$inferInsert>

export const SocialOutcomesSelect = Schema.Struct({
  claim_id: Schema.String,
  target_key: Schema.String,
  data: Schema.String,
}) satisfies Schema.Codec<typeof socialOutcomes.$inferSelect>

export const SocialOutcomesInsert = Schema.Struct({
  ...SocialOutcomesSelect.fields,
}) satisfies Schema.Codec<typeof socialOutcomes.$inferInsert>

export const SocialWorkflowsSelect = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  data: Schema.String,
  claim_token: Schema.NullOr(Schema.String),
  tenant_id: Schema.NullOr(Schema.String),
  principal_id: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof socialWorkflows.$inferSelect>

export const SocialWorkflowsInsert = Schema.Struct({
  ...SocialWorkflowsSelect.fields,
  claim_token: Schema.optional(SocialWorkflowsSelect.fields.claim_token),
  tenant_id: Schema.optional(SocialWorkflowsSelect.fields.tenant_id),
  principal_id: Schema.optional(SocialWorkflowsSelect.fields.principal_id),
}) satisfies Schema.Codec<typeof socialWorkflows.$inferInsert>

export const SocialUploadSessionsSelect = Schema.Struct({
  id: Schema.String,
  tenant_id: Schema.String,
  channel_id: Schema.String,
  ciphertext: Schema.String,
}) satisfies Schema.Codec<typeof socialUploadSessions.$inferSelect>

export const SocialUploadSessionsInsert = Schema.Struct({
  ...SocialUploadSessionsSelect.fields,
}) satisfies Schema.Codec<typeof socialUploadSessions.$inferInsert>

export const SocialInboxSelect = Schema.Struct({
  key: Schema.String,
  platform: Schema.String,
  data: Schema.String,
  tenants: Schema.String,
  state: Schema.String,
  received_at: Schema.String,
  completed_at: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<typeof socialInbox.$inferSelect>

export const SocialInboxInsert = Schema.Struct({
  ...SocialInboxSelect.fields,
  completed_at: Schema.optional(SocialInboxSelect.fields.completed_at),
}) satisfies Schema.Codec<typeof socialInbox.$inferInsert>

export const AccountRef = Schema.Struct({
  kind: Schema.Literal("connected-account"),
  version: Schema.Literal(1),
  backend: Schema.String,
  platform: Platform,
  accountId: Schema.String,
})

export const ConnectionAccountSchema = Schema.Struct({
  ref: AccountRef,
  displayName: Schema.String,
})

export const ConnectionAttemptSchema = Schema.Struct({
  id: Schema.String,
  backend: Schema.String,
  tenantId: Schema.String,
  principalId: Schema.String,
  platforms: Schema.Array(Platform),
  capabilities: Schema.Array(Schema.String),
  redirectUri: Schema.String,
  state: Schema.String,
  codeVerifier: Schema.String,
  providerState: Schema.optional(Schema.String),
  createdAt: Schema.String,
  expiresAt: Schema.String,
})

export const GrantSchema = Schema.Struct({
  grantId: Schema.String,
  tenantId: Schema.String,
  principalId: Schema.String,
  account: AccountRef,
  capabilities: Schema.Array(Schema.String),
})

export const CredentialSchema = Schema.Struct({
  accessToken: Schema.String,
  refreshToken: Schema.optional(Schema.String),
  expiresAt: Schema.optional(Schema.String),
  scopes: Schema.optional(Schema.Array(Schema.String)),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.String)),
})

export const AttemptRow = Schema.Struct({
  id: SocialAttemptsSelect.fields.id,
  tenant_id: SocialAttemptsSelect.fields.tenant_id,
  principal_id: SocialAttemptsSelect.fields.principal_id,
  state: SocialAttemptsSelect.fields.state,
  expires_at: SocialAttemptsSelect.fields.expires_at,
  ciphertext: SocialAttemptsSelect.fields.ciphertext,
  discovery_claimed: SocialAttemptsSelect.fields.discovery_claimed,
  discovery: SocialAttemptsSelect.fields.discovery,
  consumed_token: SocialAttemptsSelect.fields.consumed_token,
  platform: Platform,
})

export const CredentialRow = Schema.Struct({
  ...Schema.Struct({
    ciphertext: SocialCredentialsSelect.fields.ciphertext,
    revision: SocialCredentialsSelect.fields.revision,
  }).fields,
})

export const DataRow = Schema.Struct({ data: SocialGrantsSelect.fields.data })

export const IdempotencyRow = Schema.Struct({
  ...Schema.Struct({
    id: SocialIdempotencySelect.fields.id,
    fingerprint: SocialIdempotencySelect.fields.fingerprint,
    targets: SocialIdempotencySelect.fields.targets,
  }).fields,
})

export const WorkflowSchema = Schema.Struct({
  id: Schema.String,
  backend: Schema.String,
  accountId: Schema.String,
  childIds: Schema.Array(Schema.String),
  parentId: Schema.optional(Schema.String),
  nativeId: Schema.optional(Schema.String),
  caption: Schema.String,
  stage: Schema.Literals([
    "children",
    "parent",
    "published",
    "unknown",
    "failed",
  ]),
  options: Schema.optional(Schema.Record(Schema.String, JsonValueSchema)),
  backendState: Schema.optional(Schema.String),
})

export const InboxRow = Schema.Struct({
  key: SocialInboxSelect.fields.key,
  data: SocialInboxSelect.fields.data,
  tenants: SocialInboxSelect.fields.tenants,
  received_at: SocialInboxSelect.fields.received_at,
  platform: Platform,
  state: Schema.Literals(["pending", "quarantined", "complete"]),
  completed_at: SocialInboxSelect.fields.completed_at,
})
