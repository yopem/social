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
import { Context, Effect, Layer, Schema } from "effect"

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
import { Database } from "db/services/client"
import type { DatabaseContext } from "db/services/context"
import { failure, now, hash } from "db/services/context"
import { DatabaseRunResult, validateOperation } from "db/services/validation"
import { User } from "rpc/contracts/accounts"
import {
  Member,
  Role,
  Workspace,
  WorkspaceAcceptInviteInput,
  WorkspaceCreateInput,
  WorkspaceInviteInput,
} from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"

const WorkspaceMembershipInput = Schema.Struct({
  userId: Schema.String,
  workspaceId: Schema.String,
})

const WorkspaceAccessInput = Schema.Struct({
  ...WorkspaceMembershipInput.fields,
  manage: Schema.optional(Schema.Boolean),
})

const WorkspaceCreationInput = Schema.Struct({
  userId: Schema.String,
  ...WorkspaceCreateInput.fields,
})

const WorkspaceInvitationInput = Schema.Struct({
  userId: Schema.String,
  ...WorkspaceInviteInput.fields,
})

const InvitationAcceptanceInput = Schema.Struct({
  user: User,
  ...WorkspaceAcceptInviteInput.fields,
})

const WorkspaceMemberChangeInput = Schema.Struct({
  ...WorkspaceMembershipInput.fields,
  memberId: Schema.String,
})

export class WorkspacesDb extends Context.Service<
  WorkspacesDb,
  ReturnType<typeof createWorkspacesRepository>
>()("social/WorkspacesDb") {
  static readonly layer = Layer.effect(
    WorkspacesDb,
    Effect.map(Database, createWorkspacesRepository),
  )
}

export function createWorkspacesRepository(context: DatabaseContext) {
  const { client, query, write, batch, required } = context

  function workspaceAccess({
    userId,
    workspaceId,
    manage = false,
  }: typeof WorkspaceAccessInput.Type) {
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

  const workspaceOperations = {
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
    createWorkspace: Effect.fn("workspaces.createWorkspace")(function* ({
      userId,
      name,
      kind,
      timezone,
    }: typeof WorkspaceCreationInput.Type) {
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
    members(
      this: void,
      { userId, workspaceId }: typeof WorkspaceMembershipInput.Type,
    ) {
      return workspaceAccess({ userId, workspaceId }).pipe(
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
    invite: Effect.fn("workspaces.invite")(function* ({
      userId,
      workspaceId,
      email,
      role,
    }: typeof WorkspaceInvitationInput.Type) {
      yield* workspaceAccess({ userId, workspaceId, manage: true })

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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
    acceptInvite: Effect.fn("workspaces.acceptInvite")(function* ({
      user,
      token,
    }: typeof InvitationAcceptanceInput.Type) {
      const digest = yield* hash(token)
      const acceptanceClaim = crypto.randomUUID()
      const stamp = yield* now()
      // Consume the token and add the member in one atomic batch.
      yield* batch([
        client
          .update(invites)
          .set({ consumed_by: user.id, claim_key: acceptanceClaim })
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
                  eq(invites.claim_key, acceptanceClaim),
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
              and(
                eq(invites.token_hash, digest),
                eq(invites.claim_key, acceptanceClaim),
              ),
            ),
      ).pipe(Effect.flatMap(required))

      return yield* workspaceAccess({
        userId: user.id,
        workspaceId: invite.workspace_id,
      })
    }),
    transferOwnership: Effect.fn("workspaces.transferOwnership")(function* ({
      userId,
      workspaceId,
      memberId,
    }: typeof WorkspaceMemberChangeInput.Type) {
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
    removeMember: Effect.fn("workspaces.removeMember")(function* ({
      userId,
      workspaceId,
      memberId,
    }: typeof WorkspaceMemberChangeInput.Type) {
      yield* workspaceAccess({ userId, workspaceId, manage: true })

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
      workspaceOperations.automationPrincipal,
      Schema.Tuple([Schema.String]),
    ),
    workspaceAccess: validateOperation(
      workspaceOperations.workspaceAccess,
      Schema.Tuple([WorkspaceAccessInput]),
    ),
    listWorkspaces: validateOperation(
      workspaceOperations.listWorkspaces,
      Schema.Tuple([Schema.String]),
    ),
    createWorkspace: validateOperation(
      workspaceOperations.createWorkspace,
      Schema.Tuple([WorkspaceCreationInput]),
    ),
    members: validateOperation(
      workspaceOperations.members,
      Schema.Tuple([WorkspaceMembershipInput]),
    ),
    invite: validateOperation(
      workspaceOperations.invite,
      Schema.Tuple([WorkspaceInvitationInput]),
    ),
    acceptInvite: validateOperation(
      workspaceOperations.acceptInvite,
      Schema.Tuple([InvitationAcceptanceInput]),
    ),
    transferOwnership: validateOperation(
      workspaceOperations.transferOwnership,
      Schema.Tuple([WorkspaceMemberChangeInput]),
    ),
    removeMember: validateOperation(
      workspaceOperations.removeMember,
      Schema.Tuple([WorkspaceMemberChangeInput]),
    ),
  }
}
