import type {
  AuthorizationPolicy,
  CredentialStore,
  DeliveryOutcome,
  IdempotencyStore,
} from "@opencoredev/social-sdk"
import type { InstagramWorkflowStore } from "@opencoredev/social-sdk/instagram"
import type {
  ConnectionStore,
  CredentialLock,
  StoredCredential,
} from "@opencoredev/social-sdk/server"
import type { ThreadsWorkflowStore } from "@opencoredev/social-sdk/threads"
import type { YouTubeOptions } from "@opencoredev/social-sdk/youtube"

import { Effect, Schema } from "effect"

import { CredentialCrypto } from "auth/services/crypto"
import {
  ConnectionAccountSchema,
  ConnectionAttemptSchema,
  CredentialSchema,
  WorkflowSchema,
} from "db/schema/channels/social"
import { SocialDb } from "db/services/channels/social"
import { CoreDb } from "db/services/client"
import { Channel } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"
import { JsonValueSchema } from "rpc/lib/json"

const RefBase = {
  version: Schema.Literal(1),
  backend: Schema.String,
  platform: Schema.String,
  accountId: Schema.String,
}

const Account = Schema.Struct({
  ...RefBase,
  kind: Schema.Literal("connected-account"),
})

const Base = {
  targetIndex: Schema.Number,
  account: Account,
  observedAt: Schema.String,
  backendState: Schema.optional(Schema.String),
  delivery: Schema.optional(
    Schema.Struct({
      ...RefBase,
      kind: Schema.Literal("delivery"),
      deliveryId: Schema.String,
    }),
  ),
}

const Issue = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  severity: Schema.Literals(["error", "warning"]),
  path: Schema.optional(Schema.String),
  targetIndex: Schema.optional(Schema.Number),
})

export const OutcomeSchema = Schema.Union([
  Schema.Struct({
    ...Base,
    state: Schema.Literal("published"),
    post: Schema.Struct({
      ...RefBase,
      kind: Schema.Literal("platform-post"),
      postId: Schema.String,
      native: Schema.optional(Schema.Record(Schema.String, JsonValueSchema)),
    }),
    url: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...Base,
    state: Schema.Literal("scheduled"),
    job: Schema.Struct({
      ...RefBase,
      kind: Schema.Literal("scheduled-job"),
      jobId: Schema.String,
    }),
  }),
  Schema.Struct({
    ...Base,
    state: Schema.Literals(["accepted", "processing"]),
  }),
  Schema.Struct({
    ...Base,
    state: Schema.Literal("failed"),
    code: Schema.String,
    message: Schema.String,
    retryDisposition: Schema.Union([
      Schema.Struct({
        kind: Schema.Literals(["never", "after-reconnect", "reconcile-first"]),
      }),
      Schema.Struct({
        kind: Schema.Literal("after-delay"),
        delayMs: Schema.Number,
      }),
    ]),
  }),
  Schema.Struct({
    ...Base,
    state: Schema.Literal("unknown"),
    reason: Schema.Literals(["ambiguous-submission", "unmapped-state"]),
    diagnostic: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...Base,
    state: Schema.Literal("cancelled"),
    reason: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...Base,
    state: Schema.Literal("not-submitted"),
    reason: Schema.Literals([
      "validation",
      "unauthorized",
      "idempotency-conflict",
      "capacity",
    ]),
    issues: Schema.optional(Schema.Array(Issue)),
  }),
])

export function credentialKey(
  tenantId: string,
  backend: string,
  platform: string,
  accountId: string,
) {
  return JSON.stringify([tenantId, backend, platform, accountId])
}

export function pendingCredentialKey(attemptId: string, accountId: string) {
  return JSON.stringify(["attempt", attemptId, accountId])
}

function storageFailure() {
  return new ApiError({
    code: "storage-failure",
    message: "Stored social state is invalid",
  })
}

export function makeSdkStores(provenance?: {
  readonly tenantId: string
  readonly principalId: string
}) {
  return Effect.gen(function* () {
    const db = yield* SocialDb
    const core = yield* CoreDb
    const encryption = yield* CredentialCrypto
    const context = yield* Effect.context<never>()

    // SDK protocols require Promises; execute captured Effects only at these callback boundaries.
    function bridge<A>(effect: Effect.Effect<A, ApiError>) {
      return Effect.runPromiseWith(context)(effect)
    }

    function decode<A, I>(schema: Schema.Codec<A, I>, data: string) {
      return Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(
        data,
      ).pipe(Effect.mapError(storageFailure))
    }

    const connections: ConnectionStore = {
      save(attempt) {
        return bridge(
          Effect.gen(function* () {
            const platform = attempt.platforms[0]

            const validated = yield* Schema.decodeUnknownEffect(
              ConnectionAttemptSchema,
            )(attempt).pipe(Effect.mapError(storageFailure))

            if (validated.platforms.length !== 1 || platform === undefined)
              return yield* Effect.fail(storageFailure())

            const ciphertext = yield* encryption.encrypt(
              JSON.stringify(validated),
            )

            const first = validated.platforms[0]

            if (!first) return yield* Effect.fail(storageFailure())
            const state = yield* encryption.hash(validated.state)
            yield* db.saveAttempt({
              ...validated,
              state,
              platform: first,
              ciphertext,
            })
          }),
        )
      },
      get(id) {
        return bridge(
          db
            .attempt(id)
            .pipe(
              Effect.flatMap((row) =>
                row
                  ? encryption
                      .decrypt(row.ciphertext)
                      .pipe(
                        Effect.flatMap((data) =>
                          decode(ConnectionAttemptSchema, data),
                        ),
                      )
                  : Effect.succeed(undefined),
              ),
            ),
        )
      },
      claimDiscovery(id) {
        return bridge(db.claimDiscovery(id))
      },
      saveDiscoveredAccounts(id, accounts) {
        return bridge(
          Schema.decodeUnknownEffect(Schema.Array(ConnectionAccountSchema))(
            accounts,
          ).pipe(
            Effect.mapError(storageFailure),
            Effect.flatMap((validated) =>
              db.saveDiscovery(id, JSON.stringify(validated)),
            ),
          ),
        )
      },
      getDiscoveredAccounts(id) {
        return bridge(
          db
            .attempt(id)
            .pipe(
              Effect.flatMap((row) =>
                row?.discovery
                  ? decode(Schema.Array(ConnectionAccountSchema), row.discovery)
                  : Effect.succeed(undefined),
              ),
            ),
        )
      },
      complete(input) {
        return bridge(
          Effect.gen(function* () {
            const row = yield* db.attempt(input.attemptId)
            const state = yield* encryption.hash(input.state)

            if (!row || row.state !== state)
              return yield* Effect.fail(
                new ApiError({
                  code: "conflict",
                  message: "Connection attempt is no longer available",
                }),
              )

            const discovered = row.discovery
              ? yield* decode(
                  Schema.Array(ConnectionAccountSchema),
                  row.discovery,
                )
              : []

            const selected = new Set(input.selectedAccountIds)

            if (
              !selected.size ||
              selected.size !== input.selectedAccountIds.length ||
              [...selected].some(
                (id) =>
                  !discovered.some((account) => account.ref.accountId === id),
              )
            )
              return yield* Effect.fail(
                new ApiError({
                  code: "forbidden",
                  message: "Account was not discovered",
                }),
              )

            const attempt = yield* encryption
              .decrypt(row.ciphertext)
              .pipe(
                Effect.flatMap((data) => decode(ConnectionAttemptSchema, data)),
              )

            const grants = discovered.flatMap((account) =>
              selected.has(account.ref.accountId)
                ? [
                    {
                      grantId: crypto.randomUUID(),
                      tenantId: row.tenant_id,
                      principalId: row.principal_id,
                      account: {
                        ...account.ref,
                        backend: `${account.ref.backend}:${account.ref.accountId}`,
                      },
                      capabilities: attempt.capabilities,
                    },
                  ]
                : [],
            )

            const channels = yield* Schema.decodeUnknownEffect(
              Schema.Array(Channel),
            )(
              grants.map((grant) => ({
                id: `${grant.tenantId}:${grant.account.platform}:${grant.account.accountId}`,
                workspaceId: grant.tenantId,
                platform: grant.account.platform,
                backend: grant.account.backend,
                accountId: grant.account.accountId,
                displayName:
                  discovered.find(
                    (account) =>
                      account.ref.accountId === grant.account.accountId,
                  )?.displayName ?? grant.account.accountId,
                status: "connected",
              })),
            ).pipe(Effect.mapError(storageFailure))

            const promotions = yield* Effect.forEach(
              grants,
              (grant) =>
                Effect.gen(function* () {
                  const source = pendingCredentialKey(
                    input.attemptId,
                    grant.account.accountId,
                  )

                  const pending = yield* db.credential(source)

                  if (!pending) return yield* Effect.fail(storageFailure())

                  return {
                    source,
                    destination: credentialKey(
                      grant.tenantId,
                      grant.account.backend,
                      grant.account.platform,
                      grant.account.accountId,
                    ),
                  }
                }),
              { concurrency: 1 },
            )

            return yield* db.completeAttempt(
              input.attemptId,
              state,
              grants,
              channels,
              promotions,
            )
          }),
        )
      },
    }

    const credentials: CredentialStore<StoredCredential> = {
      get(key) {
        return bridge(
          db.credential(key).pipe(
            Effect.flatMap((row) =>
              row
                ? encryption.decrypt(row.ciphertext).pipe(
                    Effect.flatMap((data) => decode(CredentialSchema, data)),
                    Effect.map((value) => ({ value, revision: row.revision })),
                  )
                : Effect.succeed(undefined),
            ),
          ),
        )
      },
      compareAndSet(input) {
        return bridge(
          Schema.decodeUnknownEffect(CredentialSchema)(input.value).pipe(
            Effect.mapError(storageFailure),
            Effect.flatMap((value) =>
              encryption.encrypt(JSON.stringify(value)),
            ),
            Effect.flatMap((ciphertext) =>
              db.casCredential(input.key, input.expectedRevision, ciphertext),
            ),
          ),
        )
      },
      delete(key) {
        return bridge(db.deleteCredential(key))
      },
    }

    const lock: CredentialLock = {
      acquire(key, ttlMs) {
        return bridge(db.acquireLease(key, ttlMs))
      },
      release(lease) {
        return bridge(db.releaseLease(lease.key, lease.token))
      },
    }

    let persistenceFailed = false

    const idempotency: IdempotencyStore = {
      claim(input) {
        return bridge(
          Effect.gen(function* () {
            const claim = yield* db.claimIdempotency(
              input.scope,
              input.key,
              input.fingerprint,
              input.targetKeys,
              provenance,
            )

            if (
              claim.row.fingerprint !== input.fingerprint ||
              claim.row.targets !== JSON.stringify(input.targetKeys)
            )
              return { kind: "conflict" as const }
            const outcomes: Record<string, DeliveryOutcome> = {}

            for (const row of claim.outcomes)
              outcomes[row.target_key] = yield* decode(OutcomeSchema, row.data)

            return {
              kind: claim.fresh ? ("new" as const) : ("existing" as const),
              claimId: claim.row.id,
              outcomes,
            }
          }),
        )
      },
      saveOutcome(input) {
        return bridge(
          db
            .saveOutcome(
              input.claimId,
              input.targetKey,
              JSON.stringify(input.outcome),
            )
            .pipe(
              Effect.tapError(() => {
                persistenceFailed = true

                return Effect.logError(
                  "Social delivery persistence failed; reconciliation required",
                )
              }),
            ),
        )
      },
    }

    const authorization: AuthorizationPolicy = {
      authorizeTargets(input) {
        return bridge(
          Effect.gen(function* () {
            const tenant = input.context.authorization?.tenantId
            const principal = input.context.authorization?.principalId

            if (!tenant || !principal)
              return input.accounts.map((account) => ({
                account,
                allowed: false,
                reason: "Authenticated workspace is required",
              }))
            yield* core.workspaceAccess(principal, tenant)

            return yield* Effect.forEach(input.accounts, (account) =>
              db
                .grants(
                  tenant,
                  account.backend,
                  account.platform,
                  account.accountId,
                )
                .pipe(
                  Effect.map((grants) => ({
                    account,
                    allowed: grants.some((grant) =>
                      grant.capabilities.includes(input.operation),
                    ),
                    reason: "Durable account grant required",
                  })),
                ),
            )
          }),
        )
      },
    }

    function workflowStore<A, I>(
      kind: string,
      schema: Schema.Codec<A, I> & {
        readonly Type: A
      },
    ) {
      const claims = new Map<string, string>()

      function get(id: string) {
        return db
          .workflow(id)
          .pipe(
            Effect.flatMap((data) =>
              data === undefined
                ? Effect.succeed(undefined)
                : decode(schema, data),
            ),
          )
      }

      return {
        create(input: Omit<A, "id">) {
          return bridge(
            Effect.gen(function* () {
              const value = yield* Schema.decodeUnknownEffect(schema)({
                ...input,
                id: crypto.randomUUID(),
              }).pipe(Effect.mapError(storageFailure))

              const id = yield* Schema.decodeUnknownEffect(
                Schema.Struct({ id: Schema.String }),
              )(value).pipe(Effect.mapError(storageFailure))

              yield* db.createWorkflow(
                id.id,
                kind,
                JSON.stringify(value),
                provenance,
              )

              return value
            }),
          )
        },
        get(id: string) {
          return bridge(get(id))
        },
        update(id: string, update: Partial<A>) {
          return bridge(
            Effect.gen(function* () {
              const existing = yield* get(id)

              if (!existing) return yield* Effect.fail(storageFailure())

              const value = yield* Schema.decodeUnknownEffect(schema)({
                ...existing,
                ...update,
                id,
              }).pipe(Effect.mapError(storageFailure))

              yield* db.updateWorkflow(id, JSON.stringify(value))

              return value
            }),
          )
        },
        claim(id: string) {
          return bridge(
            Effect.gen(function* () {
              const token = crypto.randomUUID()
              const claimed = yield* db.claimWorkflow(id, token)

              if (claimed) claims.set(id, token)

              return claimed
            }),
          )
        },
        release(id: string) {
          const token = claims.get(id)

          return bridge(
            token
              ? db.releaseWorkflow(id, token).pipe(
                  Effect.tap(() =>
                    Effect.sync(() => {
                      claims.delete(id)
                    }),
                  ),
                )
              : Effect.void,
          )
        },
      }
    }

    const threadsSchema = Schema.Struct({
      ...WorkflowSchema.fields,
      options: Schema.Record(Schema.String, JsonValueSchema),
      stage: Schema.Literals(["children", "parent", "published", "unknown"]),
    })

    const threadWorkflows: ThreadsWorkflowStore = workflowStore(
      "threads",
      threadsSchema,
    )

    const instagramWorkflows: InstagramWorkflowStore = workflowStore(
      "instagram",
      WorkflowSchema,
    )

    return {
      bridge,
      connections,
      credentials,
      lock,
      idempotency,
      authorization,
      threadWorkflows,
      instagramWorkflows,
      persistenceFailure: () => persistenceFailed,
      saveUpload(
        tenantId: string,
        channelId: string,
        value: Parameters<NonNullable<YouTubeOptions["saveUploadSession"]>>[0],
      ) {
        return bridge(
          encryption
            .encrypt(JSON.stringify(value))
            .pipe(
              Effect.flatMap((ciphertext) =>
                db.saveUploadSession(tenantId, channelId, ciphertext),
              ),
            ),
        )
      },
    }
  })
}
