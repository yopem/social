import type { D1Database } from "@cloudflare/workers-types"

import { and, asc, eq, gt, inArray, isNull, lt, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { Context, DateTime, Effect, Layer, Schema } from "effect"

import { deletionWorkspaces } from "db/schema/accounts/deletion"
import { channels as channelTable } from "db/schema/channels"
import {
  AttemptRow,
  CredentialRow,
  DataRow,
  GrantSchema,
  IdempotencyRow,
  InboxRow,
} from "db/schema/channels/social"
import {
  socialAttempts,
  socialCredentials,
  socialGrants,
  socialIdempotency,
  socialInbox,
  socialOutcomes,
  socialRefreshLocks,
  socialUploadSessions,
  socialWorkflows,
} from "db/schema/channels/social"
import { workspaces } from "db/schema/workspaces"
import { DatabaseRunResult, validateOperation } from "db/services/validation"
import { Channel, Platform } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"

const AuthorizationSchema = Schema.Struct({
  tenantId: Schema.String,
  principalId: Schema.String,
})

interface Authorization {
  readonly tenantId: string
  readonly principalId: string
}

function storageError() {
  return new ApiError({
    code: "storage-failure",
    message: "Social state persistence failed",
  })
}

function makeSocialDb(binding: D1Database) {
  const db = drizzle(binding)

  function execute<A>(operation: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: () => Promise.resolve(operation()),
      catch: storageError,
    })
  }

  function query<A, I, B>(
    schema: Schema.Codec<A, I>,
    operation: () => PromiseLike<B>,
  ) {
    return execute(operation).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))),
      Effect.mapError(storageError),
    )
  }

  function write<B>(operation: () => PromiseLike<B>) {
    return execute(operation).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
      Effect.mapError(storageError),
      Effect.asVoid,
    )
  }

  function grantMatch(
    tenantId: string,
    backend: string,
    platform: string,
    accountId: string,
  ) {
    return and(
      eq(socialGrants.tenant_id, tenantId),
      eq(socialGrants.backend, backend),
      eq(socialGrants.platform, platform),
      eq(socialGrants.account_id, accountId),
    )
  }

  function attempt(id: string) {
    return query(AttemptRow, () =>
      db
        .select()
        .from(socialAttempts)
        .where(
          and(eq(socialAttempts.id, id), isNull(socialAttempts.consumed_token)),
        ),
    ).pipe(Effect.map((rows) => rows[0]))
  }

  const operations = {
    attempt,
    attemptByState(this: void, state: string) {
      return query(AttemptRow, () =>
        db
          .select()
          .from(socialAttempts)
          .where(
            and(
              eq(socialAttempts.state, state),
              isNull(socialAttempts.consumed_token),
            ),
          ),
      ).pipe(Effect.map((rows) => rows[0]))
    },
    saveAttempt(
      this: void,
      input: {
        readonly id: string
        readonly tenantId: string
        readonly principalId: string
        readonly platform: Platform
        readonly state: string
        readonly expiresAt: string
        readonly ciphertext: string
      },
    ) {
      return write(() =>
        db.insert(socialAttempts).values({
          id: input.id,
          tenant_id: input.tenantId,
          principal_id: input.principalId,
          platform: input.platform,
          state: input.state,
          expires_at: input.expiresAt,
          ciphertext: input.ciphertext,
        }),
      )
    },
    claimDiscovery: Effect.fn("social.claimDiscovery")(function* (id: string) {
      const time = yield* DateTime.now

      return yield* query(Schema.Struct({ id: Schema.String }), () =>
        db
          .update(socialAttempts)
          .set({ discovery_claimed: 1 })
          .where(
            and(
              eq(socialAttempts.id, id),
              eq(socialAttempts.discovery_claimed, 0),
              isNull(socialAttempts.consumed_token),
              gt(socialAttempts.expires_at, DateTime.formatIso(time)),
            ),
          )
          .returning({ id: socialAttempts.id }),
      ).pipe(Effect.map((rows) => rows.length === 1))
    }),
    saveDiscovery(this: void, id: string, data: string) {
      return write(() =>
        db
          .update(socialAttempts)
          .set({ discovery: data })
          .where(
            and(
              eq(socialAttempts.id, id),
              eq(socialAttempts.discovery_claimed, 1),
              isNull(socialAttempts.discovery),
              isNull(socialAttempts.consumed_token),
            ),
          ),
      )
    },
    completeAttempt: Effect.fn("social.completeAttempt")(function* (
      id: string,
      state: string,
      grants: readonly (typeof GrantSchema.Type)[],
      channels: readonly Channel[],
      promotions: readonly {
        readonly source: string
        readonly destination: string
      }[],
    ) {
      const token = crypto.randomUUID()
      const time = yield* DateTime.now
      const consumed = sql`EXISTS(SELECT 1 FROM ${socialAttempts} WHERE ${socialAttempts.id}=${id} AND ${socialAttempts.consumed_token}=${token})`

      const claim = db
        .update(socialAttempts)
        .set({ consumed_token: token })
        .where(
          and(
            eq(socialAttempts.id, id),
            eq(socialAttempts.state, state),
            isNull(socialAttempts.consumed_token),
            sql`${socialAttempts.discovery} IS NOT NULL`,
            gt(socialAttempts.expires_at, DateTime.formatIso(time)),
          ),
        )

      const results = yield* execute(() =>
        db.batch([
          claim.returning({ id: socialAttempts.id }),
          ...promotions.map((promotion) =>
            db
              .insert(socialCredentials)
              .select(
                db
                  .select({
                    key: sql<string>`${promotion.destination}`.as("key"),
                    revision: sql<string>`${crypto.randomUUID()}`.as(
                      "revision",
                    ),
                    ciphertext: socialCredentials.ciphertext,
                  })
                  .from(socialCredentials)
                  .where(
                    and(eq(socialCredentials.key, promotion.source), consumed),
                  ),
              )
              .onConflictDoUpdate({
                target: socialCredentials.key,
                set: {
                  revision: sql`excluded.revision`,
                  ciphertext: sql`excluded.ciphertext`,
                },
              }),
          ),
          ...grants.map((grant) =>
            db
              .insert(socialGrants)
              .select(
                db
                  .select({
                    id: sql<string>`${grant.grantId}`.as("id"),
                    tenant_id: sql<string>`${grant.tenantId}`.as("tenant_id"),
                    principal_id: sql<string>`${grant.principalId}`.as(
                      "principal_id",
                    ),
                    backend: sql<string>`${grant.account.backend}`.as(
                      "backend",
                    ),
                    platform: sql<string>`${grant.account.platform}`.as(
                      "platform",
                    ),
                    account_id: sql<string>`${grant.account.accountId}`.as(
                      "account_id",
                    ),
                    data: sql<string>`${JSON.stringify(grant)}`.as("data"),
                    revoked: sql<number>`0`.as("revoked"),
                  })
                  .from(socialAttempts)
                  .where(and(eq(socialAttempts.id, id), consumed)),
              )
              .onConflictDoUpdate({
                target: [
                  socialGrants.tenant_id,
                  socialGrants.backend,
                  socialGrants.platform,
                  socialGrants.account_id,
                ],
                set: {
                  principal_id: sql`excluded.principal_id`,
                  data: sql`excluded.data`,
                  revoked: 0,
                },
              }),
          ),
          ...channels.map((channel) =>
            db
              .insert(channelTable)
              .select(
                db
                  .select({
                    id: sql<string>`${channel.id}`.as("id"),
                    workspace_id: sql<string>`${channel.workspaceId}`.as(
                      "workspace_id",
                    ),
                    data: sql<string>`${JSON.stringify(channel)}`.as("data"),
                  })
                  .from(socialAttempts)
                  .where(and(eq(socialAttempts.id, id), consumed)),
              )
              .onConflictDoUpdate({
                target: channelTable.id,
                set: { data: sql`excluded.data` },
                setWhere: sql`${channelTable.workspace_id}=excluded.workspace_id`,
              }),
          ),
          db.delete(socialCredentials).where(
            and(
              inArray(
                socialCredentials.key,
                promotions.map((promotion) => promotion.source),
              ),
              consumed,
            ),
          ),
        ]),
      )

      const claimed = yield* Schema.decodeUnknownEffect(
        Schema.Array(Schema.Struct({ id: Schema.String })),
      )(results[0]).pipe(Effect.mapError(storageError))

      if (claimed.length !== 1)
        return yield* Effect.fail(
          new ApiError({
            code: "conflict",
            message: "Connection attempt already selected or expired",
          }),
        )

      return grants
    }),
    grants(
      this: void,
      tenantId: string,
      backend: string,
      platform: string,
      accountId: string,
    ) {
      return query(
        Schema.Struct({ data: Schema.fromJsonString(GrantSchema) }),
        () =>
          db
            .select({ data: socialGrants.data })
            .from(socialGrants)
            .where(
              and(
                grantMatch(tenantId, backend, platform, accountId),
                eq(socialGrants.revoked, 0),
                sql`NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=${socialGrants.principal_id})`,
              ),
            ),
      ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
    },
    revoke(
      this: void,
      tenantId: string,
      backend: string,
      platform: string,
      accountId: string,
    ) {
      return write(() =>
        db
          .update(socialGrants)
          .set({ revoked: 1 })
          .where(grantMatch(tenantId, backend, platform, accountId)),
      )
    },
    credential(this: void, key: string) {
      return query(CredentialRow, () =>
        db
          .select({
            ciphertext: socialCredentials.ciphertext,
            revision: socialCredentials.revision,
          })
          .from(socialCredentials)
          .where(eq(socialCredentials.key, key)),
      ).pipe(Effect.map((rows) => rows[0]))
    },
    casCredential(
      this: void,
      key: string,
      expectedRevision: string | undefined,
      ciphertext: string,
    ) {
      const revision = crypto.randomUUID()

      return query(Schema.Struct({ revision: Schema.String }), () =>
        expectedRevision === undefined
          ? db
              .insert(socialCredentials)
              .values({ key, revision, ciphertext })
              .onConflictDoNothing()
              .returning({ revision: socialCredentials.revision })
          : db
              .update(socialCredentials)
              .set({ revision, ciphertext })
              .where(
                and(
                  eq(socialCredentials.key, key),
                  eq(socialCredentials.revision, expectedRevision),
                ),
              )
              .returning({ revision: socialCredentials.revision }),
      ).pipe(
        Effect.map((rows) =>
          rows[0]
            ? { updated: true, revision: rows[0].revision }
            : { updated: false },
        ),
      )
    },
    deleteCredential(this: void, key: string) {
      return write(() =>
        db.delete(socialCredentials).where(eq(socialCredentials.key, key)),
      )
    },
    acquireLease: Effect.fn("social.acquireLease")(function* (
      key: string,
      ttlMs: number,
    ) {
      const time = yield* DateTime.now
      const token = crypto.randomUUID()

      const expiresAt = DateTime.formatIso(
        DateTime.addDuration(time, Math.min(Math.max(ttlMs, 1000), 120000)),
      )

      return yield* query(Schema.Struct({ token: Schema.String }), () =>
        db
          .insert(socialRefreshLocks)
          .values({ key, token, expires_at: expiresAt })
          .onConflictDoUpdate({
            target: socialRefreshLocks.key,
            set: { token, expires_at: expiresAt },
            setWhere: lt(
              socialRefreshLocks.expires_at,
              DateTime.formatIso(time),
            ),
          })
          .returning({ token: socialRefreshLocks.token }),
      ).pipe(
        Effect.map((rows) => (rows[0] ? { key, token, expiresAt } : undefined)),
      )
    }),
    releaseLease(this: void, key: string, token: string) {
      return write(() =>
        db
          .delete(socialRefreshLocks)
          .where(
            and(
              eq(socialRefreshLocks.key, key),
              eq(socialRefreshLocks.token, token),
            ),
          ),
      )
    },
    claimIdempotency: Effect.fn("social.claimIdempotency")(function* (
      scope: string,
      key: string,
      fingerprint: string,
      targets: readonly string[],
      authorization?: Authorization,
    ) {
      const id = crypto.randomUUID()
      yield* write(() =>
        db
          .insert(socialIdempotency)
          .values({
            id,
            scope,
            key,
            fingerprint,
            targets: JSON.stringify(targets),
            tenant_id: authorization?.tenantId ?? null,
            principal_id: authorization?.principalId ?? null,
          })
          .onConflictDoNothing(),
      )

      const rows = yield* query(IdempotencyRow, () =>
        db
          .select()
          .from(socialIdempotency)
          .where(
            and(
              eq(socialIdempotency.scope, scope),
              eq(socialIdempotency.key, key),
            ),
          ),
      )

      const row = rows[0]

      if (!row) return yield* Effect.fail(storageError())

      const outcomes = yield* query(
        Schema.Struct({ target_key: Schema.String, data: Schema.String }),
        () =>
          db
            .select({
              target_key: socialOutcomes.target_key,
              data: socialOutcomes.data,
            })
            .from(socialOutcomes)
            .where(eq(socialOutcomes.claim_id, row.id)),
      )

      return { row, fresh: row.id === id, outcomes }
    }),
    saveOutcome(this: void, claimId: string, targetKey: string, data: string) {
      return write(() =>
        db
          .insert(socialOutcomes)
          .values({ claim_id: claimId, target_key: targetKey, data })
          .onConflictDoUpdate({
            target: [socialOutcomes.claim_id, socialOutcomes.target_key],
            set: { data },
          }),
      )
    },
    workflow(this: void, id: string) {
      return query(DataRow, () =>
        db
          .select({ data: socialWorkflows.data })
          .from(socialWorkflows)
          .where(eq(socialWorkflows.id, id)),
      ).pipe(Effect.map((rows) => rows[0]?.data))
    },
    createWorkflow(
      this: void,
      id: string,
      kind: string,
      data: string,
      authorization?: Authorization,
    ) {
      return write(() =>
        db.insert(socialWorkflows).values({
          id,
          kind,
          data,
          tenant_id: authorization?.tenantId ?? null,
          principal_id: authorization?.principalId ?? null,
        }),
      )
    },
    updateWorkflow(this: void, id: string, data: string) {
      return write(() =>
        db
          .update(socialWorkflows)
          .set({ data })
          .where(eq(socialWorkflows.id, id)),
      )
    },
    claimWorkflow(this: void, id: string, token: string) {
      return query(Schema.Struct({ id: Schema.String }), () =>
        db
          .update(socialWorkflows)
          .set({ claim_token: token })
          .where(
            and(
              eq(socialWorkflows.id, id),
              isNull(socialWorkflows.claim_token),
            ),
          )
          .returning({ id: socialWorkflows.id }),
      ).pipe(Effect.map((rows) => rows.length === 1))
    },
    releaseWorkflow(this: void, id: string, token: string) {
      return write(() =>
        db
          .update(socialWorkflows)
          .set({ claim_token: null })
          .where(
            and(
              eq(socialWorkflows.id, id),
              eq(socialWorkflows.claim_token, token),
            ),
          ),
      )
    },
    saveUploadSession(
      this: void,
      tenantId: string,
      channelId: string,
      ciphertext: string,
    ) {
      return write(() =>
        db.insert(socialUploadSessions).values({
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          channel_id: channelId,
          ciphertext,
        }),
      )
    },
    resolveTenants(
      this: void,
      platform: string,
      accountIds: readonly string[],
    ) {
      return query(Schema.Struct({ tenant_id: Schema.String }), () =>
        db
          .selectDistinct({ tenant_id: socialGrants.tenant_id })
          .from(socialGrants)
          .where(
            and(
              eq(socialGrants.platform, platform),
              eq(socialGrants.revoked, 0),
              sql`NOT EXISTS(SELECT 1 FROM account_deletions WHERE user_id=${socialGrants.principal_id})`,
              inArray(socialGrants.account_id, [...accountIds]),
            ),
          ),
      ).pipe(Effect.map((rows) => rows.map((row) => row.tenant_id)))
    },
    acceptInbox: Effect.fn("social.acceptInbox")(function* (
      key: string,
      platform: Platform,
      data: string,
      tenants: readonly string[],
      quarantined = tenants.length === 0,
    ) {
      const time = yield* DateTime.now

      if (tenants.length === 0)
        return yield* query(Schema.Struct({ key: Schema.String }), () =>
          db
            .insert(socialInbox)
            .values({
              key,
              platform,
              data,
              tenants: "[]",
              state: quarantined ? "quarantined" : "pending",
              received_at: DateTime.formatIso(time),
              completed_at: null,
            })
            .onConflictDoNothing()
            .returning({ key: socialInbox.key }),
        ).pipe(
          Effect.map((rows): "accepted" | "duplicate" =>
            rows.length ? "accepted" : "duplicate",
          ),
        )

      const active = db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
          and(
            inArray(workspaces.id, [...tenants]),
            sql`NOT EXISTS(SELECT 1 FROM ${deletionWorkspaces} WHERE ${deletionWorkspaces.workspace_id}=${workspaces.id})`,
          ),
        )

      return yield* query(Schema.Struct({ key: Schema.String }), () =>
        db
          .insert(socialInbox)
          .select(
            db
              .select({
                key: sql<string>`${key}`.as("key"),
                platform: sql<string>`${platform}`.as("platform"),
                data: sql<string>`${data}`.as("data"),
                tenants:
                  sql<string>`(SELECT coalesce(json_group_array(id),'[]') FROM (${active.getSQL()}))`.as(
                    "tenants",
                  ),
                state:
                  sql<string>`${quarantined ? "quarantined" : "pending"}`.as(
                    "state",
                  ),
                received_at: sql<string>`${DateTime.formatIso(time)}`.as(
                  "received_at",
                ),
                completed_at: sql<string | null>`NULL`.as("completed_at"),
              })
              .from(workspaces)
              .where(sql`${tenants.length}=0 OR EXISTS(${active.getSQL()})`)
              .limit(1),
          )
          .onConflictDoNothing()
          .returning({ key: socialInbox.key }),
      ).pipe(
        Effect.map((rows): "accepted" | "duplicate" =>
          rows.length ? "accepted" : "duplicate",
        ),
      )
    }),
    pendingInbox(this: void, limit = 50) {
      return query(InboxRow, () =>
        db
          .select()
          .from(socialInbox)
          .where(eq(socialInbox.state, "pending"))
          .orderBy(asc(socialInbox.received_at))
          .limit(Math.min(Math.max(limit, 1), 100)),
      )
    },
    completeInbox: Effect.fn("social.completeInbox")(function* (key: string) {
      const time = yield* DateTime.now
      yield* write(() =>
        db
          .update(socialInbox)
          .set({ state: "complete", completed_at: DateTime.formatIso(time) })
          .where(
            and(eq(socialInbox.key, key), eq(socialInbox.state, "pending")),
          ),
      )
    }),
  }

  return {
    attempt: validateOperation(
      operations.attempt,
      Schema.Tuple([Schema.String]),
    ),
    attemptByState: validateOperation(
      operations.attemptByState,
      Schema.Tuple([Schema.String]),
    ),
    saveAttempt: validateOperation(
      operations.saveAttempt,
      Schema.Tuple([
        Schema.Struct({
          id: Schema.String,
          tenantId: Schema.String,
          principalId: Schema.String,
          platform: Platform,
          state: Schema.String,
          expiresAt: Schema.String,
          ciphertext: Schema.String,
        }),
      ]),
    ),
    claimDiscovery: validateOperation(
      operations.claimDiscovery,
      Schema.Tuple([Schema.String]),
    ),
    saveDiscovery: validateOperation(
      operations.saveDiscovery,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    completeAttempt: validateOperation(
      operations.completeAttempt,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.Array(GrantSchema),
        Schema.Array(Channel),
        Schema.Array(
          Schema.Struct({ source: Schema.String, destination: Schema.String }),
        ),
      ]),
    ),
    grants: validateOperation(
      operations.grants,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.String,
        Schema.String,
      ]),
    ),
    revoke: validateOperation(
      operations.revoke,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.String,
        Schema.String,
      ]),
    ),
    credential: validateOperation(
      operations.credential,
      Schema.Tuple([Schema.String]),
    ),
    casCredential: validateOperation(
      operations.casCredential,
      Schema.Tuple([
        Schema.String,
        Schema.UndefinedOr(Schema.String),
        Schema.String,
      ]),
    ),
    deleteCredential: validateOperation(
      operations.deleteCredential,
      Schema.Tuple([Schema.String]),
    ),
    acquireLease: validateOperation(
      operations.acquireLease,
      Schema.Tuple([Schema.String, Schema.Number]),
    ),
    releaseLease: validateOperation(
      operations.releaseLease,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    claimIdempotency: validateOperation(
      operations.claimIdempotency,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.String,
        Schema.Array(Schema.String),
        Schema.optionalKey(AuthorizationSchema),
      ]),
    ),
    saveOutcome: validateOperation(
      operations.saveOutcome,
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    ),
    workflow: validateOperation(
      operations.workflow,
      Schema.Tuple([Schema.String]),
    ),
    createWorkflow: validateOperation(
      operations.createWorkflow,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.String,
        Schema.optionalKey(AuthorizationSchema),
      ]),
    ),
    updateWorkflow: validateOperation(
      operations.updateWorkflow,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    claimWorkflow: validateOperation(
      operations.claimWorkflow,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    releaseWorkflow: validateOperation(
      operations.releaseWorkflow,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    saveUploadSession: validateOperation(
      operations.saveUploadSession,
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    ),
    resolveTenants: validateOperation(
      operations.resolveTenants,
      Schema.Tuple([Schema.String, Schema.Array(Schema.String)]),
    ),
    acceptInbox: validateOperation(
      operations.acceptInbox,
      Schema.Tuple([
        Schema.String,
        Platform,
        Schema.String,
        Schema.Array(Schema.String),
        Schema.optionalKey(Schema.Boolean),
      ]),
    ),
    pendingInbox: validateOperation(
      operations.pendingInbox,
      Schema.Tuple([Schema.optionalKey(Schema.Number)]),
    ),
    completeInbox: validateOperation(
      operations.completeInbox,
      Schema.Tuple([Schema.String]),
    ),
  }
}

export class SocialDb extends Context.Service<
  SocialDb,
  ReturnType<typeof makeSocialDb>
>()("social/SocialDb") {}

export function socialDbLayer(db: D1Database) {
  return Layer.succeed(SocialDb, makeSocialDb(db))
}
