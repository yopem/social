import type { D1Database } from "@cloudflare/workers-types"

import * as D1Client from "@effect/sql-d1/D1Client"
import { Context, Effect, Layer, Schema } from "effect"

import {
  AttemptRow,
  CredentialRow,
  DataRow,
  GrantSchema,
  IdempotencyRow,
  InboxRow,
} from "db/schema/social"
import type { Channel, Platform } from "rpc/contracts/models"
import { ApiError } from "rpc/contracts/models"

function storageError() {
  return new ApiError({
    code: "storage-failure",
    message: "Social state persistence failed",
  })
}

function makeSocialDb(db: D1Database) {
  return Effect.gen(function* () {
    const sql = yield* D1Client.D1Client

    function query<A, I>(
      schema: Schema.Schema<A, I>,
      text: string,
      parameters: readonly (string | number | null)[] = [],
    ) {
      return sql
        .unsafe(text, parameters)
        .pipe(
          Effect.flatMap(Schema.decodeUnknown(Schema.Array(schema))),
          Effect.mapError(storageError),
        )
    }

    function write(
      text: string,
      parameters: readonly (string | number | null)[] = [],
    ) {
      return sql
        .unsafe(text, parameters)
        .pipe(Effect.asVoid, Effect.mapError(storageError))
    }

    function attempt(id: string) {
      return query(
        AttemptRow,
        "SELECT * FROM social_attempts WHERE id=? AND consumed_token IS NULL",
        [id],
      ).pipe(Effect.map((rows) => rows[0]))
    }

    return {
      attempt,
      attemptByState(state: string) {
        return query(
          AttemptRow,
          "SELECT * FROM social_attempts WHERE state=? AND consumed_token IS NULL",
          [state],
        ).pipe(Effect.map((rows) => rows[0]))
      },
      saveAttempt(input: {
        readonly id: string
        readonly tenantId: string
        readonly principalId: string
        readonly platform: Platform
        readonly state: string
        readonly expiresAt: string
        readonly ciphertext: string
      }) {
        return write(
          "INSERT INTO social_attempts(id,tenant_id,principal_id,platform,state,expires_at,ciphertext) VALUES(?,?,?,?,?,?,?)",
          [
            input.id,
            input.tenantId,
            input.principalId,
            input.platform,
            input.state,
            input.expiresAt,
            input.ciphertext,
          ],
        )
      },
      claimDiscovery(id: string) {
        return query(
          Schema.Struct({ id: Schema.String }),
          "UPDATE social_attempts SET discovery_claimed=1 WHERE id=? AND discovery_claimed=0 AND consumed_token IS NULL AND expires_at>? RETURNING id",
          [id, new Date().toISOString()],
        ).pipe(Effect.map((rows) => rows.length === 1))
      },
      saveDiscovery(id: string, data: string) {
        return write(
          "UPDATE social_attempts SET discovery=? WHERE id=? AND discovery_claimed=1 AND discovery IS NULL AND consumed_token IS NULL",
          [data, id],
        )
      },
      completeAttempt(
        id: string,
        state: string,
        grants: readonly (typeof GrantSchema.Type)[],
        channels: readonly Channel[],
        promotions: readonly {
          readonly source: string
          readonly destination: string
        }[],
      ) {
        return Effect.gen(function* () {
          const token = crypto.randomUUID()

          // D1 batch is atomic; Effect SQL D1 does not support transactions.
          const results = yield* Effect.tryPromise({
            try: () =>
              db.batch([
                db
                  .prepare(
                    "UPDATE social_attempts SET consumed_token=? WHERE id=? AND state=? AND consumed_token IS NULL AND discovery IS NOT NULL AND expires_at>?",
                  )
                  .bind(token, id, state, new Date().toISOString()),
                ...promotions.map((promotion) =>
                  db
                    .prepare(
                      "INSERT INTO social_credentials(key,revision,ciphertext) SELECT ?,?,ciphertext FROM social_credentials WHERE key=? AND EXISTS(SELECT 1 FROM social_attempts WHERE id=? AND consumed_token=?) ON CONFLICT(key) DO UPDATE SET revision=excluded.revision,ciphertext=excluded.ciphertext",
                    )
                    .bind(
                      promotion.destination,
                      crypto.randomUUID(),
                      promotion.source,
                      id,
                      token,
                    ),
                ),
                ...grants.map((grant) =>
                  db
                    .prepare(
                      "INSERT INTO social_grants(id,tenant_id,principal_id,backend,platform,account_id,data) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM social_attempts WHERE id=? AND consumed_token=?) ON CONFLICT(tenant_id,backend,platform,account_id) DO UPDATE SET principal_id=excluded.principal_id,data=excluded.data,revoked=0",
                    )
                    .bind(
                      grant.grantId,
                      grant.tenantId,
                      grant.principalId,
                      grant.account.backend,
                      grant.account.platform,
                      grant.account.accountId,
                      JSON.stringify(grant),
                      id,
                      token,
                    ),
                ),
                ...channels.map((channel) =>
                  db
                    .prepare(
                      "INSERT INTO channels(id,workspace_id,data) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM social_attempts WHERE id=? AND consumed_token=?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE channels.workspace_id=excluded.workspace_id",
                    )
                    .bind(
                      channel.id,
                      channel.workspaceId,
                      JSON.stringify(channel),
                      id,
                      token,
                    ),
                ),
              ]),
            catch: storageError,
          })

          if (results[0]?.meta.changes !== 1)
            return yield* Effect.fail(
              new ApiError({
                code: "conflict",
                message: "Connection attempt already selected or expired",
              }),
            )

          return grants
        })
      },
      grants(
        tenantId: string,
        backend: string,
        platform: string,
        accountId: string,
      ) {
        return query(
          Schema.Struct({ data: Schema.parseJson(GrantSchema) }),
          "SELECT data FROM social_grants WHERE tenant_id=? AND backend=? AND platform=? AND account_id=? AND revoked=0",
          [tenantId, backend, platform, accountId],
        ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
      },
      revoke(
        tenantId: string,
        backend: string,
        platform: string,
        accountId: string,
      ) {
        return write(
          "UPDATE social_grants SET revoked=1 WHERE tenant_id=? AND backend=? AND platform=? AND account_id=?",
          [tenantId, backend, platform, accountId],
        )
      },
      credential(key: string) {
        return query(
          CredentialRow,
          "SELECT ciphertext,revision FROM social_credentials WHERE key=?",
          [key],
        ).pipe(Effect.map((rows) => rows[0]))
      },
      casCredential(
        key: string,
        expectedRevision: string | undefined,
        ciphertext: string,
      ) {
        const revision = crypto.randomUUID()

        const operation =
          expectedRevision === undefined
            ? query(
                Schema.Struct({ revision: Schema.String }),
                "INSERT INTO social_credentials(key,revision,ciphertext) VALUES(?,?,?) ON CONFLICT(key) DO NOTHING RETURNING revision",
                [key, revision, ciphertext],
              )
            : query(
                Schema.Struct({ revision: Schema.String }),
                "UPDATE social_credentials SET revision=?,ciphertext=? WHERE key=? AND revision=? RETURNING revision",
                [revision, ciphertext, key, expectedRevision],
              )

        return operation.pipe(
          Effect.map((rows) =>
            rows[0]
              ? { updated: true, revision: rows[0].revision }
              : { updated: false },
          ),
        )
      },
      deleteCredential(key: string) {
        return write("DELETE FROM social_credentials WHERE key=?", [key])
      },
      acquireLease(key: string, ttlMs: number) {
        const token = crypto.randomUUID()
        const now = new Date().toISOString()

        const expiresAt = new Date(
          Date.now() + Math.min(Math.max(ttlMs, 1000), 120000),
        ).toISOString()

        return query(
          Schema.Struct({ token: Schema.String }),
          "INSERT INTO social_refresh_locks(key,token,expires_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE social_refresh_locks.expires_at<? RETURNING token",
          [key, token, expiresAt, now],
        ).pipe(
          Effect.map((rows) =>
            rows[0] ? { key, token, expiresAt } : undefined,
          ),
        )
      },
      releaseLease(key: string, token: string) {
        return write(
          "DELETE FROM social_refresh_locks WHERE key=? AND token=?",
          [key, token],
        )
      },
      claimIdempotency(
        scope: string,
        key: string,
        fingerprint: string,
        targets: readonly string[],
      ) {
        return Effect.gen(function* () {
          const id = crypto.randomUUID()
          yield* write(
            "INSERT INTO social_idempotency(id,scope,key,fingerprint,targets) VALUES(?,?,?,?,?) ON CONFLICT(scope,key) DO NOTHING",
            [id, scope, key, fingerprint, JSON.stringify(targets)],
          )

          const rows = yield* query(
            IdempotencyRow,
            "SELECT * FROM social_idempotency WHERE scope=? AND key=?",
            [scope, key],
          )

          const row = rows[0]

          if (!row) return yield* Effect.fail(storageError())

          const outcomes = yield* query(
            Schema.Struct({ target_key: Schema.String, data: Schema.String }),
            "SELECT target_key,data FROM social_outcomes WHERE claim_id=?",
            [row.id],
          )

          return { row, fresh: row.id === id, outcomes }
        })
      },
      saveOutcome(claimId: string, targetKey: string, data: string) {
        return write(
          "INSERT INTO social_outcomes(claim_id,target_key,data) VALUES(?,?,?) ON CONFLICT(claim_id,target_key) DO UPDATE SET data=excluded.data",
          [claimId, targetKey, data],
        )
      },
      workflow(id: string) {
        return query(DataRow, "SELECT data FROM social_workflows WHERE id=?", [
          id,
        ]).pipe(Effect.map((rows) => rows[0]?.data))
      },
      createWorkflow(id: string, kind: string, data: string) {
        return write(
          "INSERT INTO social_workflows(id,kind,data) VALUES(?,?,?)",
          [id, kind, data],
        )
      },
      updateWorkflow(id: string, data: string) {
        return write("UPDATE social_workflows SET data=? WHERE id=?", [
          data,
          id,
        ])
      },
      claimWorkflow(id: string, token: string) {
        return query(
          Schema.Struct({ id: Schema.String }),
          "UPDATE social_workflows SET claim_token=? WHERE id=? AND claim_token IS NULL RETURNING id",
          [token, id],
        ).pipe(Effect.map((rows) => rows.length === 1))
      },
      releaseWorkflow(id: string, token: string) {
        return write(
          "UPDATE social_workflows SET claim_token=NULL WHERE id=? AND claim_token=?",
          [id, token],
        )
      },
      saveUploadSession(
        tenantId: string,
        channelId: string,
        ciphertext: string,
      ) {
        return write(
          "INSERT INTO social_upload_sessions(id,tenant_id,channel_id,ciphertext) VALUES(?,?,?,?)",
          [crypto.randomUUID(), tenantId, channelId, ciphertext],
        )
      },
      resolveTenants(platform: string, accountIds: readonly string[]) {
        return query(
          Schema.Struct({ tenant_id: Schema.String }),
          "SELECT DISTINCT tenant_id FROM social_grants WHERE platform=? AND revoked=0 AND account_id IN (SELECT value FROM json_each(?))",
          [platform, JSON.stringify(accountIds)],
        ).pipe(Effect.map((rows) => rows.map((row) => row.tenant_id)))
      },
      acceptInbox(
        key: string,
        platform: Platform,
        data: string,
        tenants: readonly string[],
        quarantined = tenants.length === 0,
      ) {
        return query(
          Schema.Struct({ key: Schema.String }),
          "INSERT INTO social_inbox(key,platform,data,tenants,state,received_at) VALUES(?,?,?,?,?,?) ON CONFLICT(key) DO NOTHING RETURNING key",
          [
            key,
            platform,
            data,
            JSON.stringify(tenants),
            quarantined ? "quarantined" : "pending",
            new Date().toISOString(),
          ],
        ).pipe(
          Effect.map((rows): "accepted" | "duplicate" =>
            rows.length ? "accepted" : "duplicate",
          ),
        )
      },
      pendingInbox(limit = 50) {
        return query(
          InboxRow,
          "SELECT * FROM social_inbox WHERE state='pending' ORDER BY received_at LIMIT ?",
          [Math.min(Math.max(limit, 1), 100)],
        )
      },
      completeInbox(key: string) {
        return write(
          "UPDATE social_inbox SET state='complete' WHERE key=? AND state='pending'",
          [key],
        )
      },
    }
  })
}

export class SocialDb extends Context.Tag("social/SocialDb")<
  SocialDb,
  Effect.Effect.Success<ReturnType<typeof makeSocialDb>>
>() {}

export function socialDbLayer(db: D1Database) {
  return Layer.effect(SocialDb, makeSocialDb(db)).pipe(
    Layer.provide(D1Client.layer({ db })),
  )
}
