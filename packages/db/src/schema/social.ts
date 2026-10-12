import { Schema } from "effect"

import { JsonValueSchema } from "rpc/contracts/json"
import { Platform } from "rpc/contracts/models"

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
  metadata: Schema.optional(
    Schema.Record({ key: Schema.String, value: Schema.String }),
  ),
})

export const AttemptRow = Schema.Struct({
  id: Schema.String,
  tenant_id: Schema.String,
  principal_id: Schema.String,
  platform: Platform,
  state: Schema.String,
  expires_at: Schema.String,
  ciphertext: Schema.String,
  discovery_claimed: Schema.Number,
  discovery: Schema.NullOr(Schema.String),
  consumed_token: Schema.NullOr(Schema.String),
})

export const CredentialRow = Schema.Struct({
  ciphertext: Schema.String,
  revision: Schema.String,
})

export const DataRow = Schema.Struct({ data: Schema.String })

export const IdempotencyRow = Schema.Struct({
  id: Schema.String,
  fingerprint: Schema.String,
  targets: Schema.String,
})

export const WorkflowSchema = Schema.Struct({
  id: Schema.String,
  backend: Schema.String,
  accountId: Schema.String,
  childIds: Schema.Array(Schema.String),
  parentId: Schema.optional(Schema.String),
  nativeId: Schema.optional(Schema.String),
  caption: Schema.String,
  stage: Schema.Literal("children", "parent", "published", "unknown", "failed"),
  options: Schema.optional(
    Schema.Record({ key: Schema.String, value: JsonValueSchema }),
  ),
  backendState: Schema.optional(Schema.String),
})

export const InboxRow = Schema.Struct({
  key: Schema.String,
  platform: Platform,
  data: Schema.String,
  tenants: Schema.String,
  state: Schema.Literal("pending", "quarantined", "complete"),
  received_at: Schema.String,
})
