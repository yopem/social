import type { D1Database } from "@cloudflare/workers-types"

import {
  and,
  count,
  eq,
  exists,
  inArray,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { alias } from "drizzle-orm/sqlite-core"
import { Context, DateTime, Effect, Layer, Schema } from "effect"

import {
  channels,
  deliveries,
  feedItems,
  feeds,
  invites,
  memberships,
  media,
  posts,
  users,
  workspaces,
} from "db/schema/core"
import {
  accountDeletions,
  accountOperations,
  deletionWorkspaces,
} from "db/schema/deletion"
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
} from "db/schema/social"
import { validateOperation } from "db/services/validation"
import { ApiError } from "rpc/contracts/models"

function failure(message = "Account deletion could not complete.") {
  return new ApiError({ code: "storage-failure", message })
}

function conflict(message: string) {
  return new ApiError({ code: "conflict", message })
}

function makeDeletion(binding: D1Database) {
  const db = drizzle(binding)

  function execute<A>(operation: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: () => Promise.resolve(operation()),
      catch: (error) => {
        const messages = [
          "An account operation is still active. Wait for it to finish, then retry deletion.",
          "Transfer ownership of shared workspaces before deleting your account.",
          "Publication must finish before account deletion.",
        ]

        const message =
          error instanceof Error
            ? messages.find((value) => error.message.includes(value))
            : undefined

        if (message) return conflict(message)

        if (
          error instanceof Error &&
          error.message.includes("Legacy provider work has no workspace owner")
        )
          return conflict(
            "Legacy provider work has no workspace owner. Resolve its ownership before deleting your account.",
          )

        if (
          error instanceof Error &&
          error.message.includes("Account deletion in progress")
        )
          return new ApiError({
            code: "forbidden",
            message: "Account or workspace deletion is in progress.",
          })

        return failure()
      },
    })
  }

  function query<A, I, B>(
    schema: Schema.Codec<A, I>,
    operation: () => PromiseLike<B>,
  ) {
    return execute(operation).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))),
      Effect.mapError((error) =>
        error instanceof ApiError ? error : failure(),
      ),
    )
  }

  function owned(userId: string) {
    return db
      .select({ workspace_id: memberships.workspace_id })
      .from(memberships)
      .where(
        and(eq(memberships.user_id, userId), eq(memberships.role, "owner")),
      )
  }

  function frozen(userId: string) {
    return db
      .select({ workspace_id: deletionWorkspaces.workspace_id })
      .from(deletionWorkspaces)
      .where(eq(deletionWorkspaces.user_id, userId))
  }

  function grantsFor(userId: string) {
    return or(
      eq(socialGrants.principal_id, userId),
      inArray(socialGrants.tenant_id, frozen(userId)),
    )
  }

  function operationsFor(userId: string) {
    return or(
      eq(accountOperations.user_id, userId),
      inArray(accountOperations.workspace_id, owned(userId)),
      inArray(
        accountOperations.workspace_id,
        db
          .select({ tenant_id: socialGrants.tenant_id })
          .from(socialGrants)
          .where(eq(socialGrants.principal_id, userId)),
      ),
    )
  }

  function claimsFor(userId: string) {
    return or(
      eq(socialIdempotency.principal_id, userId),
      inArray(socialIdempotency.tenant_id, frozen(userId)),
      sql`json_valid(${socialIdempotency.scope}) AND (json_extract(${socialIdempotency.scope}, '$[0]') IN (${frozen(userId)}) OR json_extract(${socialIdempotency.scope}, '$[2]') IN (${frozen(userId)}))`,
    )
  }

  function workflowsFor(userId: string) {
    return or(
      eq(socialWorkflows.principal_id, userId),
      inArray(socialWorkflows.tenant_id, frozen(userId)),
      and(
        isNull(socialWorkflows.tenant_id),
        sql`EXISTS(SELECT 1 FROM ${socialGrants} WHERE (${socialGrants.principal_id}=${userId} OR ${socialGrants.tenant_id} IN (${frozen(userId)})) AND ${socialGrants.backend}=json_extract(${socialWorkflows.data}, '$.backend') AND ${socialGrants.account_id}=json_extract(${socialWorkflows.data}, '$.accountId'))`,
      ),
    )
  }

  function credentialKeys(userId: string) {
    return db
      .select({ key: socialCredentials.key })
      .from(socialCredentials)
      .where(
        sql`json_valid(${socialCredentials.key}) AND ((json_extract(${socialCredentials.key}, '$[0]')='attempt' AND json_extract(${socialCredentials.key}, '$[1]') IN (SELECT ${socialAttempts.id} FROM ${socialAttempts} WHERE ${socialAttempts.principal_id}=${userId} OR ${socialAttempts.tenant_id} IN (${frozen(userId)}))) OR json_extract(${socialCredentials.key}, '$[0]') IN (${frozen(userId)}) OR EXISTS(SELECT 1 FROM ${socialGrants} WHERE (${socialGrants.principal_id}=${userId} OR ${socialGrants.tenant_id} IN (${frozen(userId)})) AND ${socialGrants.tenant_id}=json_extract(${socialCredentials.key}, '$[0]') AND ${socialGrants.backend}=json_extract(${socialCredentials.key}, '$[1]') AND ${socialGrants.platform}=json_extract(${socialCredentials.key}, '$[2]') AND ${socialGrants.account_id}=json_extract(${socialCredentials.key}, '$[3]')))`,
      )
  }

  const operations = {
    userExists(this: void, userId: string) {
      return query(Schema.Struct({ id: Schema.String }), () =>
        db.select({ id: users.id }).from(users).where(eq(users.id, userId)),
      ).pipe(Effect.map((rows) => rows.length === 1))
    },
    acquireOperation: Effect.fn("deletion.acquireOperation")(function* (
      userId: string,
      workspaceId: string | null,
    ) {
      const token = crypto.randomUUID()
      const time = yield* DateTime.now

      return yield* query(Schema.Struct({ token: Schema.String }), () =>
        db
          .insert(accountOperations)
          .values({
            token,
            user_id: userId,
            workspace_id: workspaceId,
            started_at: DateTime.formatIso(time),
          })
          .returning({ token: accountOperations.token }),
      ).pipe(
        Effect.flatMap((rows) =>
          rows[0] ? Effect.succeed(rows[0].token) : Effect.fail(failure()),
        ),
      )
    }),
    activeOperations(this: void, userId: string) {
      return query(
        Schema.Struct({
          token: Schema.String,
          workspace_id: Schema.NullOr(Schema.String),
          started_at: Schema.String,
        }),
        () =>
          db
            .select({
              token: accountOperations.token,
              workspace_id: accountOperations.workspace_id,
              started_at: accountOperations.started_at,
            })
            .from(accountOperations)
            .where(eq(accountOperations.user_id, userId)),
      )
    },
    releaseOperation(this: void, token: string) {
      return execute(() =>
        db.delete(accountOperations).where(eq(accountOperations.token, token)),
      ).pipe(Effect.asVoid)
    },
    fixtureResolveLegacyClaim(this: void, userId: string, workspaceId: string) {
      return execute(() =>
        db
          .update(socialIdempotency)
          .set({ tenant_id: workspaceId, principal_id: userId })
          .where(
            and(
              eq(
                socialIdempotency.scope,
                JSON.stringify(["credential-ready", "posts.publish"]),
              ),
              eq(socialIdempotency.key, `deletion-fixture:${userId}`),
              isNull(socialIdempotency.tenant_id),
            ),
          ),
      ).pipe(Effect.asVoid)
    },
    fixtureSnapshot: Effect.fn("deletion.fixtureSnapshot")(function* (
      userId: string,
      workspaceId: string,
    ) {
      const scopes = [
        [
          "fences",
          db
            .select({ value: count() })
            .from(accountDeletions)
            .where(eq(accountDeletions.user_id, userId)),
        ],
        [
          "users",
          db.select({ value: count() }).from(users).where(eq(users.id, userId)),
        ],
        [
          "memberships",
          db
            .select({ value: count() })
            .from(memberships)
            .where(eq(memberships.user_id, userId)),
        ],
        [
          "workspaces",
          db
            .select({ value: count() })
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId)),
        ],
        [
          "posts",
          db
            .select({ value: count() })
            .from(posts)
            .where(eq(posts.workspace_id, workspaceId)),
        ],
        [
          "media",
          db
            .select({ value: count() })
            .from(media)
            .where(eq(media.workspace_id, workspaceId)),
        ],
        [
          "feeds",
          db
            .select({ value: count() })
            .from(feeds)
            .where(eq(feeds.workspace_id, workspaceId)),
        ],
        [
          "channels",
          db
            .select({ value: count() })
            .from(channels)
            .where(eq(channels.workspace_id, workspaceId)),
        ],
        [
          "attempts",
          db
            .select({ value: count() })
            .from(socialAttempts)
            .where(
              or(
                eq(socialAttempts.principal_id, userId),
                eq(socialAttempts.tenant_id, workspaceId),
              ),
            ),
        ],
        [
          "grants",
          db
            .select({ value: count() })
            .from(socialGrants)
            .where(
              or(
                eq(socialGrants.principal_id, userId),
                eq(socialGrants.tenant_id, workspaceId),
              ),
            ),
        ],
        [
          "credentials",
          db
            .select({ value: count() })
            .from(socialCredentials)
            .where(
              sql`json_extract(${socialCredentials.key}, '$[0]')=${workspaceId} OR json_extract(${socialCredentials.key}, '$[1]') IN (SELECT ${socialAttempts.id} FROM ${socialAttempts} WHERE ${socialAttempts.principal_id}=${userId})`,
            ),
        ],
        [
          "workflows",
          db
            .select({ value: count() })
            .from(socialWorkflows)
            .where(
              or(
                eq(socialWorkflows.principal_id, userId),
                eq(socialWorkflows.tenant_id, workspaceId),
              ),
            ),
        ],
        [
          "idempotency",
          db
            .select({ value: count() })
            .from(socialIdempotency)
            .where(
              or(
                eq(socialIdempotency.principal_id, userId),
                eq(socialIdempotency.tenant_id, workspaceId),
              ),
            ),
        ],
        [
          "uploads",
          db
            .select({ value: count() })
            .from(socialUploadSessions)
            .where(eq(socialUploadSessions.tenant_id, workspaceId)),
        ],
        [
          "inbox",
          db
            .select({ value: count() })
            .from(socialInbox)
            .where(
              sql`EXISTS(SELECT 1 FROM json_each(${socialInbox.tenants}) WHERE value=${workspaceId})`,
            ),
        ],
      ] as const

      const result: Record<string, number> = {}

      for (const [key, operation] of scopes) {
        const rows = yield* query(
          Schema.Struct({ value: Schema.Number }),
          () => operation,
        )

        const row = rows[0]

        if (!row) return yield* Effect.fail(failure())
        result[key] = row.value
      }

      return result
    }),
    begin: Effect.fn("deletion.begin")(function* (userId: string) {
      const other = alias(memberships, "other")

      const shared = yield* query(
        Schema.Struct({ workspace_id: Schema.String }),
        () =>
          db
            .select({ workspace_id: memberships.workspace_id })
            .from(memberships)
            .innerJoin(
              other,
              and(
                eq(other.workspace_id, memberships.workspace_id),
                ne(other.user_id, userId),
              ),
            )
            .where(
              and(
                eq(memberships.user_id, userId),
                eq(memberships.role, "owner"),
              ),
            ),
      )

      if (shared.length)
        return yield* Effect.fail(
          conflict(
            "Transfer ownership of shared workspaces before deleting your account.",
          ),
        )

      const leases = yield* query(Schema.Struct({ token: Schema.String }), () =>
        db
          .select({ token: accountOperations.token })
          .from(accountOperations)
          .where(operationsFor(userId)),
      )

      if (leases.length)
        return yield* Effect.fail(
          conflict(
            "An account operation is still active. Wait for it to finish, then retry deletion.",
          ),
        )

      const active = yield* query(Schema.Struct({ id: Schema.String }), () =>
        db
          .select({ id: posts.id })
          .from(posts)
          .where(
            and(
              eq(posts.dispatch_status, "dispatching"),
              or(
                inArray(posts.workspace_id, owned(userId)),
                exists(
                  db
                    .select()
                    .from(channels)
                    .innerJoin(
                      socialGrants,
                      and(
                        eq(socialGrants.tenant_id, channels.workspace_id),
                        sql`${socialGrants.backend}=json_extract(${channels.data}, '$.backend')`,
                        sql`${socialGrants.platform}=json_extract(${channels.data}, '$.platform')`,
                        sql`${socialGrants.account_id}=json_extract(${channels.data}, '$.accountId')`,
                      ),
                    )
                    .where(
                      and(
                        eq(channels.workspace_id, posts.workspace_id),
                        eq(socialGrants.principal_id, userId),
                        sql`EXISTS(SELECT 1 FROM json_each(${posts.content}, '$.channelIds') target WHERE target.value=${channels.id})`,
                      ),
                    ),
                ),
              ),
            ),
          ),
      )

      const remote = yield* query(Schema.Struct({ id: Schema.String }), () =>
        db
          .select({ id: deliveries.id })
          .from(deliveries)
          .innerJoin(posts, eq(posts.id, deliveries.post_id))
          .innerJoin(
            channels,
            and(
              eq(channels.id, deliveries.channel_id),
              eq(channels.workspace_id, posts.workspace_id),
            ),
          )
          .where(
            and(
              or(
                inArray(posts.workspace_id, owned(userId)),
                exists(
                  db
                    .select()
                    .from(socialGrants)
                    .where(
                      and(
                        eq(socialGrants.principal_id, userId),
                        eq(socialGrants.tenant_id, posts.workspace_id),
                        sql`${socialGrants.backend}=json_extract(${channels.data}, '$.backend')`,
                        sql`${socialGrants.platform}=json_extract(${channels.data}, '$.platform')`,
                        sql`${socialGrants.account_id}=json_extract(${channels.data}, '$.accountId')`,
                      ),
                    ),
                ),
              ),
              sql`(json_extract(${deliveries.data}, '$.state') IN ('accepted','processing','unknown') OR (json_extract(${deliveries.data}, '$.state')='scheduled' AND json_extract(${deliveries.data}, '$.providerPostId') IS NOT NULL))`,
            ),
          ),
      )

      if (active.length || remote.length)
        return yield* Effect.fail(
          conflict("Publication must finish before account deletion."),
        )

      const legacy = yield* query(Schema.Struct({ id: Schema.String }), () =>
        db
          .select({ id: socialWorkflows.id })
          .from(socialWorkflows)
          .where(
            and(
              isNull(socialWorkflows.tenant_id),
              sql`EXISTS(SELECT 1 FROM ${socialGrants} g WHERE (g.principal_id=${userId} OR g.tenant_id IN (${owned(userId)})) AND g.backend=json_extract(${socialWorkflows.data}, '$.backend') AND g.account_id=json_extract(${socialWorkflows.data}, '$.accountId')) AND EXISTS(SELECT 1 FROM ${socialGrants} survivor WHERE survivor.principal_id!=${userId} AND survivor.tenant_id NOT IN (${owned(userId)}) AND survivor.backend=json_extract(${socialWorkflows.data}, '$.backend') AND survivor.account_id=json_extract(${socialWorkflows.data}, '$.accountId'))`,
            ),
          ),
      )

      const ambiguous = yield* query(Schema.Struct({ id: Schema.String }), () =>
        db
          .select({ id: socialIdempotency.id })
          .from(socialIdempotency)
          .where(
            and(
              isNull(socialIdempotency.tenant_id),
              or(
                isNull(socialIdempotency.principal_id),
                eq(socialIdempotency.principal_id, userId),
              ),
              sql`json_valid(${socialIdempotency.scope}) AND json_extract(${socialIdempotency.scope}, '$[0]')='credential-ready'`,
            ),
          ),
      )

      if (legacy.length || ambiguous.length)
        return yield* Effect.fail(
          conflict(
            "Legacy provider work has no workspace owner. Resolve its ownership before deleting your account.",
          ),
        )
      yield* execute(() =>
        db.batch([
          db
            .insert(accountDeletions)
            .values({ user_id: userId })
            .onConflictDoNothing(),
          db
            .insert(deletionWorkspaces)
            .select(
              db
                .select({
                  workspace_id: memberships.workspace_id,
                  user_id: memberships.user_id,
                })
                .from(memberships)
                .where(
                  and(
                    eq(memberships.user_id, userId),
                    eq(memberships.role, "owner"),
                  ),
                ),
            )
            .onConflictDoNothing(),
          db
            .update(posts)
            .set({
              state: "cancelled",
              operation_key: null,
              dispatch_status: null,
              lease_until: null,
            })
            .where(
              and(
                inArray(posts.workspace_id, frozen(userId)),
                inArray(posts.state, [
                  "draft",
                  "scheduled",
                  "pending",
                  "needs-review",
                ]),
              ),
            ),
          db
            .update(feeds)
            .set({
              data: sql`json_set(${feeds.data}, '$.enabled', json('false'))`,
            })
            .where(inArray(feeds.workspace_id, frozen(userId))),
        ]),
      )

      return yield* query(Schema.Struct({ workspace_id: Schema.String }), () =>
        db
          .select({ workspace_id: deletionWorkspaces.workspace_id })
          .from(deletionWorkspaces)
          .where(eq(deletionWorkspaces.user_id, userId)),
      )
    }),
    finish(this: void, userId: string) {
      const credentials = credentialKeys(userId)

      const claims = db
        .select({ id: socialIdempotency.id })
        .from(socialIdempotency)
        .where(claimsFor(userId))

      const targetedChannels = db
        .select({ id: channels.id })
        .from(channels)
        .where(
          sql`EXISTS(SELECT 1 FROM ${socialGrants} WHERE (${grantsFor(userId)}) AND ${socialGrants.tenant_id}=${channels.workspace_id} AND ${socialGrants.platform}=json_extract(${channels.data}, '$.platform') AND ${socialGrants.account_id}=json_extract(${channels.data}, '$.accountId'))`,
        )

      return execute(() =>
        db.batch([
          db
            .delete(socialRefreshLocks)
            .where(inArray(socialRefreshLocks.key, credentials)),
          db
            .delete(socialCredentials)
            .where(inArray(socialCredentials.key, credentials)),
          db
            .delete(socialUploadSessions)
            .where(
              or(
                inArray(socialUploadSessions.tenant_id, frozen(userId)),
                inArray(socialUploadSessions.channel_id, targetedChannels),
              ),
            ),
          db.delete(socialWorkflows).where(workflowsFor(userId)),
          db
            .delete(socialOutcomes)
            .where(inArray(socialOutcomes.claim_id, claims)),
          db.delete(socialIdempotency).where(claimsFor(userId)),
          db
            .delete(socialInbox)
            .where(
              sql`EXISTS(SELECT 1 FROM json_each(${socialInbox.tenants}) WHERE value IN (${frozen(userId)})) AND NOT EXISTS(SELECT 1 FROM json_each(${socialInbox.tenants}) WHERE value NOT IN (${frozen(userId)}))`,
            ),
          db
            .update(socialInbox)
            .set({
              tenants: sql`(SELECT COALESCE(json_group_array(value),'[]') FROM json_each(${socialInbox.tenants}) WHERE value NOT IN (${frozen(userId)}))`,
            })
            .where(
              sql`EXISTS(SELECT 1 FROM json_each(${socialInbox.tenants}) WHERE value IN (${frozen(userId)}))`,
            ),
          db
            .update(channels)
            .set({
              data: sql`json_set(${channels.data}, '$.status', 'disconnected')`,
            })
            .where(inArray(channels.id, targetedChannels)),
          db
            .delete(socialAttempts)
            .where(
              or(
                eq(socialAttempts.principal_id, userId),
                inArray(socialAttempts.tenant_id, frozen(userId)),
              ),
            ),
          db.delete(socialGrants).where(grantsFor(userId)),
          db.delete(deliveries).where(
            inArray(
              deliveries.post_id,
              db
                .select({ id: posts.id })
                .from(posts)
                .where(inArray(posts.workspace_id, frozen(userId))),
            ),
          ),
          db.delete(feedItems).where(
            inArray(
              feedItems.feed_id,
              db
                .select({ id: feeds.id })
                .from(feeds)
                .where(inArray(feeds.workspace_id, frozen(userId))),
            ),
          ),
          db.delete(posts).where(inArray(posts.workspace_id, frozen(userId))),
          db.delete(workspaces).where(inArray(workspaces.id, frozen(userId))),
          db
            .delete(invites)
            .where(
              or(
                eq(invites.consumed_by, userId),
                sql`lower(${invites.email})=(SELECT lower(${users.email}) FROM ${users} WHERE ${users.id}=${userId})`,
              ),
            ),
          db.delete(memberships).where(eq(memberships.user_id, userId)),
          db
            .delete(accountDeletions)
            .where(eq(accountDeletions.user_id, userId)),
          db.delete(users).where(eq(users.id, userId)),
        ]),
      ).pipe(Effect.asVoid)
    },
  }

  return {
    userExists: validateOperation(
      operations.userExists,
      Schema.Tuple([Schema.String]),
    ),
    acquireOperation: validateOperation(
      operations.acquireOperation,
      Schema.Tuple([Schema.String, Schema.NullOr(Schema.String)]),
    ),
    activeOperations: validateOperation(
      operations.activeOperations,
      Schema.Tuple([Schema.String]),
    ),
    releaseOperation: validateOperation(
      operations.releaseOperation,
      Schema.Tuple([Schema.String]),
    ),
    fixtureResolveLegacyClaim: validateOperation(
      operations.fixtureResolveLegacyClaim,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    fixtureSnapshot: validateOperation(
      operations.fixtureSnapshot,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    begin: validateOperation(operations.begin, Schema.Tuple([Schema.String])),
    finish: validateOperation(operations.finish, Schema.Tuple([Schema.String])),
  }
}

export class DeletionDb extends Context.Service<
  DeletionDb,
  ReturnType<typeof makeDeletion>
>()("social/DeletionDb") {}

export function deletionDbLayer(db: D1Database) {
  return Layer.succeed(DeletionDb, makeDeletion(db))
}
