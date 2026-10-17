import {
  sql,
  getTableColumns,
  eq,
  and,
  ne,
  count,
  notExists,
  exists,
  inArray,
} from "drizzle-orm"
import { alias } from "drizzle-orm/sqlite-core"
import { Effect, Schema } from "effect"

import { users, UserRow } from "db/schema/accounts"
import {
  accountDeletions,
  deletionWorkspaces,
} from "db/schema/accounts/deletion"
import {
  workspaces,
  memberships,
  invites,
  WorkspaceRow,
} from "db/schema/workspaces"
import type { CoreContext } from "db/services/core"
import { failure, now, hash } from "db/services/core"
import { DatabaseRunResult, validateOperation } from "db/services/validation"
import { User } from "rpc/contracts/accounts"
import { WorkspaceTimezone } from "rpc/contracts/workspaces"
import { WorkspaceKind } from "rpc/contracts/workspaces"
import { Member, Role, Workspace } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"

export function createWorkspacesRepository(context: CoreContext) {
  const { client, query, write, batch, required } = context

  function workspaceAccess(
    userId: string,
    workspaceId: string,
    manage = false,
  ) {
    return query(WorkspaceRow, () =>
      client
        .select({ ...getTableColumns(workspaces), role: memberships.role })
        .from(workspaces)
        .innerJoin(memberships, eq(memberships.workspace_id, workspaces.id))
        .where(
          sql`${workspaces.id}=${workspaceId} AND ${memberships.user_id}=${userId} AND NOT EXISTS(SELECT 1 FROM account_deletions d WHERE d.user_id=${memberships.user_id}) AND NOT EXISTS(SELECT 1 FROM deletion_workspaces d WHERE d.workspace_id=${workspaces.id})`,
        ),
    ).pipe(
      Effect.flatMap((rows) =>
        rows[0] && (!manage || rows[0].role !== "editor")
          ? Effect.succeed(rows[0])
          : Effect.fail(failure("forbidden", "Workspace access denied")),
      ),
    )
  }

  function listWorkspaces(userId: string) {
    return query(WorkspaceRow, () =>
      client
        .select({ ...getTableColumns(workspaces), role: memberships.role })
        .from(workspaces)
        .innerJoin(memberships, eq(memberships.workspace_id, workspaces.id))
        .where(eq(memberships.user_id, userId))
        .orderBy(workspaces.id)
        .limit(100),
    )
  }

  const operations = {
    automationPrincipal(this: void, workspaceId: string) {
      return query(UserRow, () =>
        client
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .innerJoin(memberships, eq(memberships.user_id, users.id))
          .where(
            sql`${memberships.workspace_id}=${workspaceId} AND ${memberships.role}='owner' AND NOT EXISTS(SELECT 1 FROM deletion_workspaces d WHERE d.workspace_id=${memberships.workspace_id})`,
          ),
      ).pipe(Effect.flatMap(required))
    },
    workspaceAccess,
    listWorkspaces,
    createWorkspace: Effect.fn("core.createWorkspace")(function* (
      userId: string,
      name: string,
      kind: typeof WorkspaceKind.Type,
      timezone: string,
    ) {
      yield* Schema.decodeUnknownEffect(WorkspaceTimezone)(timezone).pipe(
        Effect.mapError(() =>
          failure("invalid-input", "Invalid workspace timezone"),
        ),
      )

      const value = yield* Schema.decodeUnknownEffect(Workspace)({
        id: crypto.randomUUID(),
        name,
        kind,
        timezone,
        role: "owner",
      }).pipe(
        Effect.mapError(() => failure("invalid-input", "Invalid workspace")),
      )

      yield* batch([
        client.insert(workspaces).values({
          id: value.id,
          name: value.name,
          kind: value.kind,
          timezone: value.timezone,
        }),
        client.insert(memberships).values({
          workspace_id: value.id,
          user_id: userId,
          role: "owner",
        }),
      ])

      return value
    }),
    members(this: void, userId: string, workspaceId: string) {
      return workspaceAccess(userId, workspaceId).pipe(
        Effect.andThen(
          query(
            Schema.Struct({
              id: Schema.String,
              name: Schema.String,
              email: Schema.String,
              role: Role,
            }),
            () =>
              client
                .select({
                  id: users.id,
                  name: users.name,
                  email: users.email,
                  role: memberships.role,
                })
                .from(memberships)
                .innerJoin(users, eq(users.id, memberships.user_id))
                .where(eq(memberships.workspace_id, workspaceId))
                .orderBy(users.id)
                .limit(100),
          ),
        ),
        Effect.flatMap((rows) =>
          Schema.decodeUnknownEffect(Schema.Array(Member))(
            rows.map((row) => ({
              user: { id: row.id, name: row.name, email: row.email },
              role: row.role,
            })),
          ),
        ),
        Effect.mapError((error) =>
          error instanceof ApiError
            ? error
            : failure("storage-failure", "Invalid member data"),
        ),
      )
    },
    invite: Effect.fn("core.invite")(function* (
      userId: string,
      workspaceId: string,
      email: string,
      role: "admin" | "editor",
    ) {
      yield* workspaceAccess(userId, workspaceId, true)

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !["admin", "editor"].includes(role)
      )
        return yield* Effect.fail(
          failure("invalid-input", "Invalid invitation"),
        )
      const token = `${crypto.randomUUID()}${crypto.randomUUID()}`
      const digest = yield* hash(token)
      const expiresAt = yield* now(7 * 86400000)
      yield* write(() =>
        client.insert(invites).values({
          token_hash: digest,
          workspace_id: workspaceId,
          email: email.toLowerCase(),
          role,
          expires_at: expiresAt,
        }),
      )

      return { token }
    }),
    acceptInvite: Effect.fn("core.acceptInvite")(function* (
      user: User,
      token: string,
    ) {
      const digest = yield* hash(token)
      const claim = crypto.randomUUID()
      const stamp = yield* now()
      yield* batch([
        client
          .update(invites)
          .set({ consumed_by: user.id, claim_key: claim })
          .where(
            sql`token_hash=${digest} AND email=lower(${user.email}) AND expires_at>${stamp} AND consumed_by IS NULL`,
          ),
        client
          .insert(memberships)
          .select(
            client
              .select({
                workspace_id: invites.workspace_id,
                user_id: sql<string>`${invites.consumed_by}`.as("user_id"),
                role: invites.role,
              })
              .from(invites)
              .where(
                and(
                  eq(invites.token_hash, digest),
                  eq(invites.claim_key, claim),
                ),
              ),
          )
          .onConflictDoNothing({
            target: [memberships.workspace_id, memberships.user_id],
          }),
      ])

      const invite = yield* query(
        Schema.Struct({ workspace_id: Schema.String }),
        () =>
          client
            .select({ workspace_id: invites.workspace_id })
            .from(invites)
            .where(
              and(eq(invites.token_hash, digest), eq(invites.claim_key, claim)),
            ),
      ).pipe(Effect.flatMap(required))

      return yield* workspaceAccess(user.id, invite.workspace_id)
    }),
    transferOwnership: Effect.fn("core.transferOwnership")(function* (
      userId: string,
      workspaceId: string,
      memberId: string,
    ) {
      if (userId === memberId)
        return yield* failure(
          "invalid-input",
          "Select another workspace member.",
        )

      const owner = alias(memberships, "transfer_owner")
      const target = alias(memberships, "transfer_target")

      const ownerCount = client
        .select({ value: count() })
        .from(owner)
        .where(
          and(eq(owner.workspace_id, workspaceId), eq(owner.role, "owner")),
        )

      const eligible = and(
        eq(memberships.workspace_id, workspaceId),
        eq(memberships.user_id, userId),
        eq(memberships.role, "owner"),
        sql`(${ownerCount})=1`,
        exists(
          client
            .select({ id: owner.user_id })
            .from(owner)
            .where(
              and(
                eq(owner.workspace_id, workspaceId),
                eq(owner.user_id, userId),
                eq(owner.role, "owner"),
              ),
            ),
        ),
        exists(
          client
            .select({ id: target.user_id })
            .from(target)
            .where(
              and(
                eq(target.workspace_id, workspaceId),
                eq(target.user_id, memberId),
                inArray(target.role, ["admin", "editor"]),
              ),
            ),
        ),
        notExists(
          client
            .select()
            .from(accountDeletions)
            .where(inArray(accountDeletions.user_id, [userId, memberId])),
        ),
        notExists(
          client
            .select()
            .from(deletionWorkspaces)
            .where(eq(deletionWorkspaces.workspace_id, workspaceId)),
        ),
      )

      const result = yield* Effect.tryPromise({
        try: () =>
          client.batch([
            client
              .update(memberships)
              .set({ role: "admin" })
              .where(eligible)
              .returning({
                user_id: memberships.user_id,
                role: memberships.role,
              }),
            client
              .update(memberships)
              .set({ role: "owner" })
              .where(
                and(
                  eq(memberships.workspace_id, workspaceId),
                  eq(memberships.user_id, memberId),
                  inArray(memberships.role, ["admin", "editor"]),
                  // Promote only after this batch changes the old owner.
                  sql`changes()=1`,
                  sql`(${ownerCount})=0`,
                ),
              )
              .returning({
                user_id: memberships.user_id,
                role: memberships.role,
              }),
            // A duplicate membership aborts the batch if no owner remains.
            client.insert(memberships).select(
              client
                .select({
                  workspace_id: memberships.workspace_id,
                  user_id: memberships.user_id,
                  role: memberships.role,
                })
                .from(memberships)
                .where(
                  and(
                    eq(memberships.workspace_id, workspaceId),
                    eq(memberships.user_id, userId),
                    sql`(${ownerCount})=0`,
                  ),
                ),
            ),
          ]),
        catch: () =>
          failure("conflict", "Ownership transfer could not complete."),
      })

      const row = Schema.Array(
        Schema.Struct({ user_id: Schema.String, role: Role }),
      )

      const rows = yield* Schema.decodeUnknownEffect(
        Schema.Tuple([row, row, DatabaseRunResult]),
      )(result).pipe(
        Effect.mapError(() =>
          failure("storage-failure", "Invalid ownership transfer result."),
        ),
      )

      if (rows[0].length !== 1 || rows[1].length !== 1)
        return yield* failure(
          "forbidden",
          "Ownership transfer requires an active owner and member.",
        )
    }),
    removeMember: Effect.fn("core.removeMember")(function* (
      userId: string,
      workspaceId: string,
      memberId: string,
    ) {
      yield* workspaceAccess(userId, workspaceId, true)

      if (userId === memberId)
        return yield* Effect.fail(
          failure("invalid-input", "Cannot remove yourself"),
        )

      const rows = yield* query(Schema.Struct({ user_id: Schema.String }), () =>
        client
          .delete(memberships)
          .where(
            and(
              eq(memberships.workspace_id, workspaceId),
              eq(memberships.user_id, memberId),
              ne(memberships.role, "owner"),
            ),
          )
          .returning({ user_id: memberships.user_id }),
      )

      if (!rows.length)
        return yield* Effect.fail(
          failure(
            "forbidden",
            "Cannot remove workspace owner or absent member",
          ),
        )
    }),
  }

  return {
    automationPrincipal: validateOperation(
      operations.automationPrincipal,
      Schema.Tuple([Schema.String]),
    ),
    workspaceAccess: validateOperation(
      operations.workspaceAccess,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.optionalKey(Schema.UndefinedOr(Schema.Boolean)),
      ]),
    ),
    listWorkspaces: validateOperation(
      operations.listWorkspaces,
      Schema.Tuple([Schema.String]),
    ),
    createWorkspace: validateOperation(
      operations.createWorkspace,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        WorkspaceKind,
        Schema.String,
      ]),
    ),
    members: validateOperation(
      operations.members,
      Schema.Tuple([Schema.String, Schema.String]),
    ),
    invite: validateOperation(
      operations.invite,
      Schema.Tuple([
        Schema.String,
        Schema.String,
        Schema.String,
        Schema.Literals(["admin", "editor"]),
      ]),
    ),
    acceptInvite: validateOperation(
      operations.acceptInvite,
      Schema.Tuple([User, Schema.String]),
    ),
    transferOwnership: validateOperation(
      operations.transferOwnership,
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    ),
    removeMember: validateOperation(
      operations.removeMember,
      Schema.Tuple([Schema.String, Schema.String, Schema.String]),
    ),
  }
}
