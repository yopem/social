import type { D1Database } from "@cloudflare/workers-types"
import type { BatchItem } from "drizzle-orm/batch"

import {
  sql,
  getTableColumns,
  eq,
  and,
  ne,
  count,
  notExists,
  exists,
  gt,
  lt,
  lte,
  isNull,
  isNotNull,
  inArray,
  desc,
  or,
  gte,
} from "drizzle-orm"
import { drizzle } from "drizzle-orm/d1"
import { alias } from "drizzle-orm/sqlite-core"
import {
  Context,
  DateTime,
  Effect,
  Layer,
  Match,
  Option,
  Schema,
  Struct,
} from "effect"

import {
  users,
  workspaces,
  memberships,
  invites,
  channels,
  media,
  posts,
  deliveries,
  feeds,
  feedItems,
  authAttempts,
  AuthAttempt,
  ChannelRow,
  ConsumedAuthAttempt,
  DeliveryRow,
  FeedRow,
  MediaRow,
  PostRow,
  UserRow,
  WorkspaceRow,
} from "db/schema/core"
import { accountDeletions, deletionWorkspaces } from "db/schema/deletion"
import { DatabaseRunResult, validateOperation } from "db/services/validation"
import {
  MediaListInput,
  PostListPageInput,
  PostListPageResult,
  WorkspaceTimezone,
} from "rpc/contracts/app"
import { WorkspaceKind } from "rpc/contracts/models"
import type { Post } from "rpc/contracts/models"
import {
  ApiError,
  Channel,
  Delivery,
  Feed,
  Media,
  Member,
  PostContent,
  PostState,
  Role,
  User,
  Workspace,
} from "rpc/contracts/models"

function failure(code: ApiError["code"], message: string) {
  return new ApiError({ code, message })
}

function now(offset = 0) {
  return DateTime.now.pipe(
    Effect.map((time) =>
      DateTime.formatIso(DateTime.addDuration(time, offset)),
    ),
  )
}

function hash(value: string) {
  return Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    catch: () => failure("storage-failure", "Hash failed"),
  }).pipe(
    Effect.map((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    ),
  )
}

function makeCore(db: D1Database) {
  return Effect.sync(() => {
    const client = drizzle(db)

    function query<A, I, Row>(
      schema: Schema.Codec<A, I>,
      execute: () => PromiseLike<readonly Row[]>,
    ) {
      return Effect.tryPromise({
        try: () => Promise.resolve(execute()),
        catch: () => failure("storage-failure", "Database operation failed"),
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))),
        Effect.mapError(() =>
          failure("storage-failure", "Database operation failed"),
        ),
      )
    }

    function write<Result>(execute: () => PromiseLike<Result>) {
      return Effect.tryPromise({
        try: () => Promise.resolve(execute()),
        catch: () => failure("storage-failure", "Database write failed"),
      }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
        Effect.mapError(() =>
          failure("storage-failure", "Invalid database write result."),
        ),
        Effect.asVoid,
      )
    }

    function batch(
      statements: readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
    ) {
      return Effect.tryPromise({
        try: () => client.batch(statements),
        catch: () => failure("storage-failure", "Atomic database write failed"),
      }).pipe(
        Effect.flatMap(
          Schema.decodeUnknownEffect(Schema.Array(DatabaseRunResult)),
        ),
        Effect.mapError(() =>
          failure("storage-failure", "Invalid database batch result."),
        ),
        Effect.asVoid,
      )
    }

    function required<A>(rows: readonly A[]) {
      return rows[0] === undefined
        ? Effect.fail(failure("not-found", "Record not found"))
        : Effect.succeed(rows[0])
    }

    function getUser(issuer: string, subjectId: string) {
      return query(UserRow, () =>
        client
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(
            and(eq(users.issuer, issuer), eq(users.subject_id, subjectId)),
          ),
      ).pipe(Effect.map((rows) => rows[0] ?? null))
    }

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

    const publicationOperation = Effect.fnUntraced(function* (
      workspaceId: string,
      id: string,
    ) {
      return yield* query(
        Schema.Struct({
          state: PostState,
          operation_key: Schema.NullOr(Schema.String),
          dispatch_status: Schema.NullOr(Schema.String),
        }),
        () =>
          client
            .select({
              state: posts.state,
              operation_key: posts.operation_key,
              dispatch_status: posts.dispatch_status,
            })
            .from(posts)
            .where(and(eq(posts.workspace_id, workspaceId), eq(posts.id, id))),
      ).pipe(Effect.flatMap(required))
    })

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

    const getPost = Effect.fnUntraced(function* (
      workspaceId: string,
      id: string,
    ) {
      const row = yield* query(PostRow, () =>
        client
          .select()
          .from(posts)
          .where(and(eq(posts.workspace_id, workspaceId), eq(posts.id, id))),
      ).pipe(Effect.flatMap(required))

      const storedDeliveries = yield* query(DeliveryRow, () =>
        client
          .select({ data: deliveries.data })
          .from(deliveries)
          .where(eq(deliveries.post_id, id))
          .orderBy(deliveries.id)
          .limit(40),
      )

      return {
        id: row.id,
        workspaceId: row.workspace_id,
        content: row.content,
        state: row.state,
        scheduledAt: row.scheduled_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        reviewReason: row.review_reason,
        deliveries: storedDeliveries.map((item) => item.data),
      }
    })

    function getFeed(workspaceId: string, id: string) {
      return query(FeedRow, () =>
        client
          .select({ data: feeds.data })
          .from(feeds)
          .where(and(eq(feeds.workspace_id, workspaceId), eq(feeds.id, id))),
      ).pipe(
        Effect.flatMap(required),
        Effect.map((row) => row.data),
      )
    }

    function channel(workspaceId: string, id: string) {
      return query(ChannelRow, () =>
        client
          .select({ data: channels.data })
          .from(channels)
          .where(
            and(eq(channels.workspace_id, workspaceId), eq(channels.id, id)),
          ),
      ).pipe(
        Effect.flatMap(required),
        Effect.map((row) => row.data),
      )
    }

    const operations = {
      getUser,
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
      getPost,
      publicationOperation,
      getFeed,
      channel,
      provisionUser: Effect.fn("core.provisionUser")(function* (
        issuer: string,
        subject: {
          readonly id: string
          readonly email: string
          readonly name: string | null
        },
      ) {
        const subjectName = subject.name?.trim() ?? ""

        const user = yield* Schema.decodeUnknownEffect(User)({
          id: crypto.randomUUID(),
          name: subjectName.length > 0 ? subjectName : subject.email,
          email: subject.email,
        }).pipe(Effect.mapError(() => failure("invalid-input", "Invalid user")))

        const workspaceId = crypto.randomUUID()
        yield* batch([
          client
            .insert(users)
            .values({
              id: user.id,
              issuer,
              subject_id: subject.id,
              name: user.name,
              email: user.email,
              initial_workspace_id: workspaceId,
            })
            .onConflictDoUpdate({
              target: [users.issuer, users.subject_id],
              set: { name: user.name, email: user.email },
            }),
          client
            .insert(workspaces)
            .select(
              client
                .select({
                  id: users.initial_workspace_id,
                  name: users.name,
                  kind: sql<string>`'personal'`.as("kind"),
                  timezone: sql<string>`'UTC'`.as("timezone"),
                })
                .from(users)
                .where(
                  and(
                    eq(users.issuer, issuer),
                    eq(users.subject_id, subject.id),
                  ),
                ),
            )
            .onConflictDoNothing(),
          client
            .insert(memberships)
            .select(
              client
                .select({
                  workspace_id: users.initial_workspace_id,
                  user_id: users.id,
                  role: sql<string>`'owner'`.as("role"),
                })
                .from(users)
                .where(
                  and(
                    eq(users.issuer, issuer),
                    eq(users.subject_id, subject.id),
                  ),
                ),
            )
            .onConflictDoNothing(),
        ])
        const saved = yield* getUser(issuer, subject.id)

        if (saved === null)
          return yield* Effect.fail(
            failure("storage-failure", "User provisioning failed"),
          )

        return saved
      }),
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
                and(
                  eq(invites.token_hash, digest),
                  eq(invites.claim_key, claim),
                ),
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

        const rows = yield* query(
          Schema.Struct({ user_id: Schema.String }),
          () =>
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
      // Callers must check workspaceAccess before internal workspace-only operations.
      listChannels(this: void, workspaceId: string) {
        return query(ChannelRow, () =>
          client
            .select({ data: channels.data })
            .from(channels)
            .where(eq(channels.workspace_id, workspaceId))
            .orderBy(channels.id)
            .limit(100),
        ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
      },
      upsertChannel(this: void, value: Channel) {
        return Schema.decodeUnknownEffect(Channel)(value).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid channel")),
          Effect.flatMap((row) =>
            write(() =>
              client
                .insert(channels)
                .values({
                  id: row.id,
                  workspace_id: row.workspaceId,
                  data: JSON.stringify(row),
                })
                .onConflictDoUpdate({
                  target: channels.id,
                  set: { data: JSON.stringify(row) },
                  setWhere: sql`${channels.workspace_id}=${row.workspaceId}`,
                }),
            ),
          ),
        )
      },
      disconnectChannel(this: void, workspaceId: string, id: string) {
        return channel(workspaceId, id).pipe(
          Effect.flatMap((value) =>
            write(() =>
              client
                .update(channels)
                .set({
                  data: sql`${JSON.stringify({ ...value, status: "disconnected" })}`,
                })
                .where(
                  and(
                    eq(channels.workspace_id, workspaceId),
                    eq(channels.id, id),
                  ),
                ),
            ),
          ),
        )
      },
      listPosts(
        this: void,
        workspaceId: string,
        filter: "all" | "draft" | "queue" | "sent",
      ) {
        const states = Match.value(filter).pipe(
          Match.when("draft", () =>
            inArray(posts.state, ["draft", "needs-review"]),
          ),
          Match.when("queue", () =>
            inArray(posts.state, ["scheduled", "pending"]),
          ),
          Match.when("sent", () =>
            inArray(posts.state, ["published", "partial", "failed"]),
          ),
          Match.orElse(() => undefined),
        )

        return query(Schema.Struct({ id: Schema.String }), () =>
          client
            .select({ id: posts.id })
            .from(posts)
            .where(and(eq(posts.workspace_id, workspaceId), states))
            .orderBy(desc(posts.created_at))
            .limit(100),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => getPost(workspaceId, row.id), {
              concurrency: 4,
            }),
          ),
        )
      },
      listPostsPage: Effect.fn("core.listPostsPage")(function* (
        input: typeof PostListPageInput.Type,
      ) {
        const value = yield* Schema.decodeUnknownEffect(PostListPageInput)(
          input,
        ).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid post page")),
        )

        const states = Match.value(value.filter).pipe(
          Match.when("draft", () =>
            inArray(posts.state, ["draft", "needs-review"]),
          ),
          Match.when("queue", () =>
            inArray(posts.state, ["scheduled", "pending"]),
          ),
          Match.when("sent", () =>
            inArray(posts.state, ["published", "partial", "failed"]),
          ),
          Match.when("calendar", () =>
            or(isNotNull(posts.scheduled_at), eq(posts.state, "cancelled")),
          ),
          Match.orElse(() => undefined),
        )

        const limit = value.limit ?? 50

        const rows = yield* query(PostRow, () =>
          client
            .select()
            .from(posts)
            .where(
              and(
                eq(posts.workspace_id, value.workspaceId),
                states,
                value.channelId
                  ? sql`EXISTS(SELECT 1 FROM json_each(${posts.content}, '$.channelIds') WHERE value=${value.channelId})`
                  : undefined,
                value.scheduledFrom
                  ? gte(posts.scheduled_at, value.scheduledFrom)
                  : undefined,
                value.scheduledBefore
                  ? lt(posts.scheduled_at, value.scheduledBefore)
                  : undefined,
                value.cursor
                  ? or(
                      lt(posts.created_at, value.cursor.createdAt),
                      and(
                        eq(posts.created_at, value.cursor.createdAt),
                        lt(posts.id, value.cursor.id),
                      ),
                    )
                  : undefined,
              ),
            )
            .orderBy(desc(posts.created_at), desc(posts.id))
            .limit(limit + 1),
        )

        const selected = rows.slice(0, limit)
        const last = selected.at(-1)

        const rankedDeliveries = client
          .select({
            id: deliveries.id,
            post_id: deliveries.post_id,
            data: deliveries.data,
            rank: sql<number>`row_number() over (partition by ${deliveries.post_id} order by ${deliveries.id})`.as(
              "delivery_rank",
            ),
          })
          .from(deliveries)
          .where(
            inArray(
              deliveries.post_id,
              selected.map((row) => row.id),
            ),
          )
          .as("ranked_deliveries")

        const storedDeliveries = selected.length
          ? yield* query(
              Schema.Struct({
                post_id: Schema.String,
                ...DeliveryRow.fields,
              }),
              () =>
                client
                  .select({
                    post_id: rankedDeliveries.post_id,
                    data: rankedDeliveries.data,
                  })
                  .from(rankedDeliveries)
                  .where(lte(rankedDeliveries.rank, sql`40`))
                  .orderBy(rankedDeliveries.id),
            )
          : []

        const items = selected.map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          content: row.content,
          state: row.state,
          scheduledAt: row.scheduled_at,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          reviewReason: row.review_reason,
          deliveries: storedDeliveries
            .filter((item) => item.post_id === row.id)
            .map((item) => item.data),
        }))

        return yield* Schema.decodeUnknownEffect(PostListPageResult)({
          items,
          nextCursor:
            rows.length > limit && last
              ? { createdAt: last.created_at, id: last.id }
              : null,
        }).pipe(
          Effect.mapError(() =>
            failure("storage-failure", "Invalid post page result"),
          ),
        )
      }),
      listMedia: Effect.fn("core.listMedia")(function* (
        input: typeof MediaListInput.Type,
      ) {
        const value = yield* Schema.decodeUnknownEffect(MediaListInput)(
          input,
        ).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid media list")),
        )

        if (!value.mediaIds.length) return []

        const rows = yield* query(MediaRow, () =>
          client
            .select({ data: media.data, object_key: media.object_key })
            .from(media)
            .where(
              and(
                eq(media.workspace_id, value.workspaceId),
                inArray(media.id, [...value.mediaIds]),
              ),
            ),
        )

        return yield* Effect.forEach(value.mediaIds, (id) => {
          const row = rows.find((item) => item.data.id === id)

          return row
            ? Schema.decodeUnknownEffect(Media)({
                ...row.data,
                url: `/media/${encodeURIComponent(id)}`,
              }).pipe(
                Effect.mapError(() =>
                  failure("storage-failure", "Invalid stored media"),
                ),
              )
            : Effect.fail(failure("not-found", "Media not found"))
        })
      }),
      savePost: Effect.fn("core.savePost")(function* (
        workspaceId: string,
        content: PostContent,
        scheduledAt: string | null,
        postId?: string,
      ) {
        const valid = yield* Schema.decodeUnknownEffect(PostContent)(
          content,
        ).pipe(
          Effect.mapError(() =>
            failure("invalid-input", "Invalid post content"),
          ),
        )

        const scheduledTime =
          scheduledAt === null ? Option.none() : DateTime.make(scheduledAt)

        if (
          scheduledAt !== null &&
          (Option.isNone(scheduledTime) ||
            DateTime.formatIso(scheduledTime.value) !== scheduledAt)
        )
          return yield* Effect.fail(
            failure("invalid-input", "Schedule must use UTC ISO time"),
          )

        for (const id of valid.channelIds) yield* channel(workspaceId, id)

        for (const override of valid.overrides)
          if (!valid.channelIds.includes(override.channelId))
            return yield* Effect.fail(
              failure(
                "invalid-input",
                "Override must target a selected channel",
              ),
            )

        for (const id of valid.mediaIds)
          yield* query(MediaRow, () =>
            client
              .select({ data: media.data, object_key: media.object_key })
              .from(media)
              .where(
                and(eq(media.workspace_id, workspaceId), eq(media.id, id)),
              ),
          ).pipe(Effect.flatMap(required))
        const id = postId ?? crypto.randomUUID()
        const stamp = yield* now()

        if (postId) {
          const updated = yield* query(
            Schema.Struct({ id: Schema.String }),
            () =>
              client
                .update(posts)
                .set({
                  content: JSON.stringify(valid),
                  scheduled_at: scheduledAt,
                  state: scheduledAt ? "scheduled" : "draft",
                  updated_at: stamp,
                  review_reason: null,
                })
                .where(
                  and(
                    eq(posts.workspace_id, workspaceId),
                    eq(posts.id, id),
                    inArray(posts.state, [
                      "draft",
                      "scheduled",
                      "needs-review",
                      "cancelled",
                    ]),
                    isNull(posts.operation_key),
                  ),
                )
                .returning({ id: posts.id }),
          )

          if (!updated.length)
            return yield* Effect.fail(
              failure("conflict", "Post cannot be edited"),
            )
        } else
          yield* write(() =>
            client.insert(posts).values({
              id,
              workspace_id: workspaceId,
              content: JSON.stringify(valid),
              state: scheduledAt ? "scheduled" : "draft",
              scheduled_at: scheduledAt,
              created_at: stamp,
              updated_at: stamp,
            }),
          )

        return yield* getPost(workspaceId, id)
      }),
      setPostState: Effect.fn("core.setPostState")(function* (
        workspaceId: string,
        id: string,
        state: typeof PostState.Type,
        reviewReason: string | null = null,
      ) {
        const stamp = yield* now()

        return yield* Schema.decodeUnknownEffect(PostState)(state).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid post state")),
          Effect.flatMap((valid) => {
            const update: Partial<typeof posts.$inferInsert> = {
              state: valid,
              review_reason: reviewReason,
              updated_at: stamp,
            }

            if (
              ["published", "partial", "failed", "cancelled"].includes(valid)
            ) {
              update.dispatch_status = null
              update.lease_until = null
            }

            return query(Schema.Struct({ id: Schema.String }), () =>
              client
                .update(posts)
                .set(update)
                .where(
                  and(eq(posts.workspace_id, workspaceId), eq(posts.id, id)),
                )
                .returning({ id: posts.id }),
            )
          }),
          Effect.flatMap(required),
          Effect.asVoid,
        )
      }),
      saveDelivery(this: void, value: Delivery) {
        return Schema.decodeUnknownEffect(Delivery)(value).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid delivery")),
          Effect.flatMap((row) =>
            query(Schema.Struct({ id: Schema.String }), () =>
              client
                .insert(deliveries)
                .select(
                  client
                    .select({
                      id: sql<string>`${row.id}`.as("id"),
                      post_id: posts.id,
                      channel_id: channels.id,
                      data: sql<string>`${JSON.stringify(row)}`.as("data"),
                    })
                    .from(posts)
                    .innerJoin(
                      channels,
                      eq(channels.workspace_id, posts.workspace_id),
                    )
                    .where(
                      and(
                        eq(posts.id, row.postId),
                        eq(channels.id, row.channelId),
                        sql`json_extract(${channels.data},'$.platform')=${row.platform}`,
                      ),
                    ),
                )
                .onConflictDoUpdate({
                  target: [deliveries.post_id, deliveries.channel_id],
                  set: { data: JSON.stringify(row) },
                })
                .returning({ id: deliveries.id }),
            ),
          ),
          Effect.flatMap(required),
          Effect.asVoid,
        )
      },
      cancelPost: Effect.fn("core.cancelPost")(function* (
        workspaceId: string,
        id: string,
      ) {
        const stamp = yield* now()

        return yield* query(Schema.Struct({ id: Schema.String }), () =>
          client
            .update(posts)
            .set({ state: "cancelled", updated_at: stamp })
            .where(
              and(
                eq(posts.workspace_id, workspaceId),
                eq(posts.id, id),
                inArray(posts.state, ["draft", "scheduled", "needs-review"]),
                isNull(posts.operation_key),
              ),
            )
            .returning({ id: posts.id }),
        ).pipe(
          Effect.flatMap(required),
          Effect.andThen(getPost(workspaceId, id)),
        )
      }),
      deletePost(this: void, workspaceId: string, id: string) {
        return query(Schema.Struct({ id: Schema.String }), () =>
          client
            .delete(posts)
            .where(
              and(
                eq(posts.workspace_id, workspaceId),
                eq(posts.id, id),
                inArray(posts.state, ["draft", "cancelled", "needs-review"]),
                isNull(posts.operation_key),
              ),
            )
            .returning({ id: posts.id }),
        ).pipe(Effect.flatMap(required), Effect.asVoid)
      },
      claimPost: Effect.fn("core.claimPost")(function* (
        workspaceId: string,
        id: string,
        operationKey: string,
        expected?: Pick<Post, "content" | "scheduledAt" | "updatedAt">,
      ) {
        const stamp = yield* now()

        const claimed = yield* query(Schema.Struct({ id: Schema.String }), () =>
          client
            .update(posts)
            .set({
              state: "pending",
              operation_key: operationKey,
              dispatch_status: "dispatching",
              lease_until: null,
              updated_at: stamp,
            })
            .where(
              sql`workspace_id=${workspaceId} AND id=${id} AND ((state IN ('draft','scheduled') AND operation_key IS NULL AND ${operationKey} NOT LIKE 'scheduled:%') OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key=${operationKey})) AND (${expected === undefined ? 1 : 0} OR (content=${expected ? JSON.stringify(expected.content) : null} AND scheduled_at IS ${expected?.scheduledAt ?? null} AND updated_at=${expected?.updatedAt ?? null}))`,
            )
            .returning({ id: posts.id }),
        ).pipe(Effect.map((rows) => rows.length === 1))

        if (claimed || expected === undefined) return claimed

        const current = yield* publicationOperation(workspaceId, id)

        if (
          current.operation_key === operationKey &&
          (current.dispatch_status === "dispatching" ||
            ["published", "partial", "failed", "cancelled"].includes(
              current.state,
            ))
        )
          return false

        return yield* Effect.fail(
          failure(
            "conflict",
            "Post changed before publication. Review it and try again.",
          ),
        )
      }),
      claimDuePosts: Effect.fn("core.claimDuePosts")(function* (limit: number) {
        const stamp = yield* now()
        const leaseUntil = yield* now(300000)
        const cutoff = yield* now(-900000)

        return yield* query(
          Schema.Struct({ id: Schema.String, workspace_id: Schema.String }),
          () =>
            client
              .update(posts)
              .set({
                state: "pending",
                operation_key: sql`'scheduled:'||id`,
                dispatch_status: "leased",
                lease_until: leaseUntil,
                updated_at: stamp,
              })
              .where(
                sql`id IN (SELECT id FROM posts WHERE (state='scheduled' AND scheduled_at<=${stamp} AND operation_key IS NULL) OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key='scheduled:'||id AND (lease_until<=${stamp} OR (dispatch_status='enqueued' AND lease_until IS NULL AND updated_at<=${cutoff}))) ORDER BY scheduled_at LIMIT ${Math.max(1, Math.min(100, Math.floor(limit)))}) AND ((state='scheduled' AND operation_key IS NULL) OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key='scheduled:'||id AND (lease_until<=${stamp} OR (dispatch_status='enqueued' AND lease_until IS NULL AND updated_at<=${cutoff}))))`,
              )
              .returning({ id: posts.id, workspace_id: posts.workspace_id }),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => getPost(row.workspace_id, row.id), {
              concurrency: 4,
            }),
          ),
        )
      }),
      markPostEnqueued: Effect.fn("core.markPostEnqueued")(function* (
        workspaceId: string,
        id: string,
        operationKey: string,
      ) {
        const leaseUntil = yield* now(900000)

        return yield* write(() =>
          client
            .update(posts)
            .set({ dispatch_status: "enqueued", lease_until: leaseUntil })
            .where(
              and(
                eq(posts.workspace_id, workspaceId),
                eq(posts.id, id),
                eq(posts.state, "pending"),
                eq(posts.operation_key, operationKey),
                eq(posts.dispatch_status, "leased"),
              ),
            ),
        )
      }),
      saveMedia(this: void, value: Media & { readonly objectKey: string }) {
        return Schema.decodeUnknownEffect(Media)(value).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid media")),
          Effect.flatMap((row) =>
            write(() =>
              client.insert(media).values({
                id: row.id,
                workspace_id: row.workspaceId,
                object_key: value.objectKey,
                data: JSON.stringify({
                  ...row,
                  url: `/media/${encodeURIComponent(row.id)}`,
                }),
              }),
            ),
          ),
        )
      },
      media(this: void, workspaceId: string, id: string) {
        return query(MediaRow, () =>
          client
            .select({ data: media.data, object_key: media.object_key })
            .from(media)
            .where(and(eq(media.workspace_id, workspaceId), eq(media.id, id))),
        ).pipe(
          Effect.flatMap(required),
          Effect.map((row) => ({ ...row.data, objectKey: row.object_key })),
        )
      },
      mediaById(this: void, userId: string, id: string) {
        return query(MediaRow, () =>
          client
            .select({ data: media.data, object_key: media.object_key })
            .from(media)
            .innerJoin(
              memberships,
              eq(memberships.workspace_id, media.workspace_id),
            )
            .where(and(eq(memberships.user_id, userId), eq(media.id, id))),
        ).pipe(
          Effect.flatMap(required),
          Effect.map((row) => ({ ...row.data, objectKey: row.object_key })),
        )
      },
      holdPost: Effect.fn("core.holdPost")(function* (
        workspaceId: string,
        id: string,
        reason: string,
      ) {
        const stamp = yield* now()

        const rows = yield* query(Schema.Struct({ id: Schema.String }), () =>
          client
            .update(posts)
            .set({
              state: "needs-review",
              review_reason: reason,
              operation_key: null,
              dispatch_status: null,
              lease_until: null,
              updated_at: stamp,
            })
            .where(
              sql`workspace_id=${workspaceId} AND id=${id} AND (operation_key IS NULL OR dispatch_status IN ('leased','enqueued'))`,
            )
            .returning({ id: posts.id }),
        )

        if (!rows.length)
          return yield* Effect.fail(
            failure("conflict", "Post cannot be held after dispatch"),
          )
      }),
      listFeeds(this: void, workspaceId: string) {
        return query(FeedRow, () =>
          client
            .select({ data: feeds.data })
            .from(feeds)
            .where(eq(feeds.workspace_id, workspaceId))
            .orderBy(feeds.id)
            .limit(100),
        ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
      },
      saveFeed: Effect.fn("core.saveFeed")(function* (
        workspaceId: string,
        config: Omit<Feed, "id" | "workspaceId" | "lastCheckedAt" | "error">,
        feedId?: string,
      ) {
        const old = feedId ? yield* getFeed(workspaceId, feedId) : null

        const value = yield* Schema.decodeUnknownEffect(Feed)({
          ...config,
          id: feedId ?? crypto.randomUUID(),
          workspaceId,
          lastCheckedAt: old?.lastCheckedAt ?? null,
          error: old?.error ?? null,
        }).pipe(Effect.mapError(() => failure("invalid-input", "Invalid feed")))

        for (const id of value.channelIds) yield* channel(workspaceId, id)
        yield* write(() =>
          client
            .insert(feeds)
            .values({
              id: value.id,
              workspace_id: workspaceId,
              data: JSON.stringify(value),
              last_checked_at: value.lastCheckedAt,
            })
            .onConflictDoUpdate({
              target: feeds.id,
              set: { data: JSON.stringify(value) },
              setWhere: sql`${feeds.workspace_id}=${workspaceId}`,
            }),
        )

        return value
      }),
      deleteFeed(this: void, workspaceId: string, id: string) {
        return write(() =>
          client
            .delete(feeds)
            .where(and(eq(feeds.workspace_id, workspaceId), eq(feeds.id, id))),
        )
      },
      importFeedPost: Effect.fn("core.importFeedPost")(function* (
        workspaceId: string,
        feedId: string,
        itemKey: string,
        content: PostContent,
        reviewReason?: string,
      ) {
        yield* getFeed(workspaceId, feedId)

        const valid = yield* Schema.decodeUnknownEffect(PostContent)(
          content,
        ).pipe(
          Effect.mapError(() =>
            failure("invalid-input", "Invalid imported post"),
          ),
        )

        for (const id of valid.channelIds) yield* channel(workspaceId, id)

        for (const override of valid.overrides)
          if (!valid.channelIds.includes(override.channelId))
            return yield* Effect.fail(
              failure(
                "invalid-input",
                "Override must target a selected channel",
              ),
            )

        for (const id of valid.mediaIds)
          yield* query(MediaRow, () =>
            client
              .select({ data: media.data, object_key: media.object_key })
              .from(media)
              .where(
                and(eq(media.workspace_id, workspaceId), eq(media.id, id)),
              ),
          ).pipe(Effect.flatMap(required))
        const postId = crypto.randomUUID()
        const stamp = yield* now()
        yield* batch([
          client.insert(posts).select(
            client
              .select({
                id: sql<string>`${postId}`.as("id"),
                workspace_id: feeds.workspace_id,
                content: sql<string>`${JSON.stringify(valid)}`.as("content"),
                state:
                  sql<string>`${reviewReason ? "needs-review" : "draft"}`.as(
                    "state",
                  ),
                scheduled_at: sql<string | null>`NULL`.as("scheduled_at"),
                created_at: sql<string>`${stamp}`.as("created_at"),
                updated_at: sql<string>`${stamp}`.as("updated_at"),
                review_reason: sql<string | null>`${reviewReason ?? null}`.as(
                  "review_reason",
                ),
                operation_key: sql<string | null>`NULL`.as("operation_key"),
                lease_until: sql<string | null>`NULL`.as("lease_until"),
                dispatch_status: sql<string | null>`NULL`.as("dispatch_status"),
              })
              .from(feeds)
              .where(
                and(
                  eq(feeds.id, feedId),
                  eq(feeds.workspace_id, workspaceId),
                  notExists(
                    client
                      .select()
                      .from(feedItems)
                      .where(
                        and(
                          eq(feedItems.feed_id, feedId),
                          eq(feedItems.item_key, itemKey),
                        ),
                      ),
                  ),
                ),
              ),
          ),
          client
            .insert(feedItems)
            .select(
              client
                .select({
                  feed_id: sql<string>`${feedId}`.as("feed_id"),
                  item_key: sql<string>`${itemKey}`.as("item_key"),
                  claimed_at: sql<string>`${stamp}`.as("claimed_at"),
                  post_id: posts.id,
                })
                .from(posts)
                .where(eq(posts.id, postId)),
            )
            .onConflictDoNothing({
              target: [feedItems.feed_id, feedItems.item_key],
            }),
        ])

        const item = yield* query(
          Schema.Struct({ post_id: Schema.NullOr(Schema.String) }),
          () =>
            client
              .select({ post_id: feedItems.post_id })
              .from(feedItems)
              .innerJoin(feeds, eq(feeds.id, feedItems.feed_id))
              .where(
                and(
                  eq(feeds.workspace_id, workspaceId),
                  eq(feedItems.feed_id, feedId),
                  eq(feedItems.item_key, itemKey),
                ),
              ),
        ).pipe(Effect.flatMap(required))

        if (!item.post_id) return { post: null, created: false }

        return {
          post: yield* getPost(workspaceId, item.post_id),
          created: item.post_id === postId,
        }
      }),
      findImportedPost(
        this: void,
        workspaceId: string,
        feedId: string,
        itemKey: string,
      ) {
        return query(
          Schema.Struct({ post_id: Schema.NullOr(Schema.String) }),
          () =>
            client
              .select({ post_id: feedItems.post_id })
              .from(feedItems)
              .innerJoin(feeds, eq(feeds.id, feedItems.feed_id))
              .where(
                and(
                  eq(feeds.workspace_id, workspaceId),
                  eq(feedItems.feed_id, feedId),
                  eq(feedItems.item_key, itemKey),
                ),
              ),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.gen(function* () {
              const row = rows[0]

              if (!row) return null

              const post = row.post_id
                ? yield* getPost(workspaceId, row.post_id)
                : null

              return { post }
            }),
          ),
        )
      },
      listPendingPosts: Effect.fn("core.listPendingPosts")(function* (
        limit: number,
      ) {
        const cutoff = yield* now(-300000)

        return yield* query(
          Schema.Struct({ id: Schema.String, workspace_id: Schema.String }),
          () =>
            client
              .select({ id: posts.id, workspace_id: posts.workspace_id })
              .from(posts)
              .where(
                and(
                  eq(posts.state, "pending"),
                  eq(posts.dispatch_status, "dispatching"),
                  lt(posts.updated_at, cutoff),
                ),
              )
              .orderBy(posts.updated_at)
              .limit(Math.max(1, Math.min(100, Math.floor(limit)))),
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => getPost(row.workspace_id, row.id), {
              concurrency: 4,
            }),
          ),
        )
      }),
      deleteUnusedMedia(this: void, workspaceId: string, id: string) {
        return query(Schema.Struct({ object_key: Schema.String }), () =>
          client
            .delete(media)
            .where(
              sql`workspace_id=${workspaceId} AND id=${id} AND NOT EXISTS(SELECT 1 FROM posts p,json_each(p.content,'$.mediaIds') m WHERE p.workspace_id=media.workspace_id AND m.value=media.id)`,
            )
            .returning({ object_key: media.object_key }),
        ).pipe(
          Effect.map((rows) =>
            rows[0] ? { objectKey: rows[0].object_key } : null,
          ),
        )
      },
      claimFeedItem: Effect.fn("core.claimFeedItem")(function* (
        feedId: string,
        itemKey: string,
      ) {
        const stamp = yield* now()

        return yield* query(Schema.Struct({ item_key: Schema.String }), () =>
          client
            .insert(feedItems)
            .values({ feed_id: feedId, item_key: itemKey, claimed_at: stamp })
            .onConflictDoNothing()
            .returning({ item_key: feedItems.item_key }),
        ).pipe(Effect.map((rows) => rows.length === 1))
      }),
      listDueFeeds: Effect.fn("core.listDueFeeds")(function* (limit: number) {
        const cutoff = yield* now(-900000)

        return yield* query(FeedRow, () =>
          client
            .select({ data: feeds.data })
            .from(feeds)
            .where(
              sql`json_extract(data,'$.enabled')=1 AND (last_checked_at IS NULL OR last_checked_at<${cutoff})`,
            )
            .orderBy(feeds.last_checked_at)
            .limit(Math.max(1, Math.min(100, Math.floor(limit)))),
        ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
      }),
      recordFeedCheck: Effect.fn("core.recordFeedCheck")(function* (
        workspaceId: string,
        id: string,
        error: string | null,
      ) {
        const stamp = yield* now()

        return yield* write(() =>
          client
            .update(feeds)
            .set({
              data: sql`json_set(data,'$.lastCheckedAt',${stamp},'$.error',${error})`,
              last_checked_at: sql`${stamp}`,
            })
            .where(and(eq(feeds.workspace_id, workspaceId), eq(feeds.id, id))),
        )
      }),
      saveAuthAttempt: Effect.fn("core.saveAuthAttempt")(function* (
        value: typeof AuthAttempt.Type,
      ) {
        const stamp = yield* now()

        return yield* Schema.decodeUnknownEffect(AuthAttempt)(value).pipe(
          Effect.mapError(() =>
            failure("invalid-input", "Invalid auth attempt"),
          ),
          Effect.flatMap((row) =>
            batch([
              client
                .delete(authAttempts)
                .where(
                  sql`state IN (SELECT state FROM auth_attempts WHERE expires_at<${stamp} ORDER BY expires_at LIMIT 100)`,
                ),
              client.insert(authAttempts).values({
                state: row.state,
                nonce_hash: row.nonceHash,
                verifier: row.verifier,
                expires_at: row.expiresAt,
              }),
            ]),
          ),
        )
      }),
      consumeAuthAttempt: Effect.fn("core.consumeAuthAttempt")(function* (
        state: string,
        nonceHash: string,
      ) {
        const stamp = yield* now()

        return yield* query(ConsumedAuthAttempt, () =>
          client
            .update(authAttempts)
            .set({ consumed_at: stamp })
            .where(
              and(
                eq(authAttempts.state, state),
                eq(authAttempts.nonce_hash, nonceHash),
                gt(authAttempts.expires_at, stamp),
                isNull(authAttempts.consumed_at),
              ),
            )
            .returning({ verifier: authAttempts.verifier }),
        ).pipe(
          Effect.flatMap((rows) =>
            rows[0]
              ? Effect.succeed(rows[0])
              : Effect.fail(
                  failure("invalid-input", "Invalid or expired OAuth state"),
                ),
          ),
        )
      }),
    }

    return {
      getUser: validateOperation(
        operations.getUser,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
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
      getPost: validateOperation(
        operations.getPost,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      publicationOperation: validateOperation(
        operations.publicationOperation,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      getFeed: validateOperation(
        operations.getFeed,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      channel: validateOperation(
        operations.channel,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      provisionUser: validateOperation(
        operations.provisionUser,
        Schema.Tuple([
          Schema.String,
          Schema.Struct({
            id: Schema.String,
            email: Schema.String,
            name: Schema.NullOr(Schema.String),
          }),
        ]),
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
      listChannels: validateOperation(
        operations.listChannels,
        Schema.Tuple([Schema.String]),
      ),
      upsertChannel: validateOperation(
        operations.upsertChannel,
        Schema.Tuple([Channel]),
      ),
      disconnectChannel: validateOperation(
        operations.disconnectChannel,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      listPostsPage: validateOperation(
        operations.listPostsPage,
        Schema.Tuple([PostListPageInput]),
      ),
      listMedia: validateOperation(
        operations.listMedia,
        Schema.Tuple([MediaListInput]),
      ),
      listPosts: validateOperation(
        operations.listPosts,
        Schema.Tuple([
          Schema.String,
          Schema.Literals(["all", "draft", "queue", "sent"]),
        ]),
      ),
      savePost: validateOperation(
        operations.savePost,
        Schema.Tuple([
          Schema.String,
          PostContent,
          Schema.NullOr(Schema.String),
          Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
        ]),
      ),
      setPostState: validateOperation(
        operations.setPostState,
        Schema.Tuple([
          Schema.String,
          Schema.String,
          PostState,
          Schema.optionalKey(Schema.UndefinedOr(Schema.NullOr(Schema.String))),
        ]),
      ),
      saveDelivery: validateOperation(
        operations.saveDelivery,
        Schema.Tuple([Delivery]),
      ),
      cancelPost: validateOperation(
        operations.cancelPost,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      deletePost: validateOperation(
        operations.deletePost,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      claimPost: validateOperation(
        operations.claimPost,
        Schema.Tuple([
          Schema.String,
          Schema.String,
          Schema.String,
          Schema.optionalKey(
            Schema.UndefinedOr(
              Schema.Struct({
                content: PostContent,
                scheduledAt: Schema.NullOr(Schema.String),
                updatedAt: Schema.String,
              }),
            ),
          ),
        ]),
      ),
      claimDuePosts: validateOperation(
        operations.claimDuePosts,
        Schema.Tuple([Schema.Number]),
      ),
      markPostEnqueued: validateOperation(
        operations.markPostEnqueued,
        Schema.Tuple([Schema.String, Schema.String, Schema.String]),
      ),
      saveMedia: validateOperation(
        operations.saveMedia,
        Schema.Tuple([
          Schema.Struct({ ...Media.fields, objectKey: Schema.String }),
        ]),
      ),
      media: validateOperation(
        operations.media,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      mediaById: validateOperation(
        operations.mediaById,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      holdPost: validateOperation(
        operations.holdPost,
        Schema.Tuple([Schema.String, Schema.String, Schema.String]),
      ),
      listFeeds: validateOperation(
        operations.listFeeds,
        Schema.Tuple([Schema.String]),
      ),
      saveFeed: validateOperation(
        operations.saveFeed,
        Schema.Tuple([
          Schema.String,
          Schema.Struct(
            Struct.omit(Feed.fields, [
              "id",
              "workspaceId",
              "lastCheckedAt",
              "error",
            ]),
          ),
          Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
        ]),
      ),
      deleteFeed: validateOperation(
        operations.deleteFeed,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      importFeedPost: validateOperation(
        operations.importFeedPost,
        Schema.Tuple([
          Schema.String,
          Schema.String,
          Schema.String,
          PostContent,
          Schema.optionalKey(Schema.UndefinedOr(Schema.String)),
        ]),
      ),
      findImportedPost: validateOperation(
        operations.findImportedPost,
        Schema.Tuple([Schema.String, Schema.String, Schema.String]),
      ),
      listPendingPosts: validateOperation(
        operations.listPendingPosts,
        Schema.Tuple([Schema.Number]),
      ),
      deleteUnusedMedia: validateOperation(
        operations.deleteUnusedMedia,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      claimFeedItem: validateOperation(
        operations.claimFeedItem,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
      listDueFeeds: validateOperation(
        operations.listDueFeeds,
        Schema.Tuple([Schema.Number]),
      ),
      recordFeedCheck: validateOperation(
        operations.recordFeedCheck,
        Schema.Tuple([
          Schema.String,
          Schema.String,
          Schema.NullOr(Schema.String),
        ]),
      ),
      saveAuthAttempt: validateOperation(
        operations.saveAuthAttempt,
        Schema.Tuple([AuthAttempt]),
      ),
      consumeAuthAttempt: validateOperation(
        operations.consumeAuthAttempt,
        Schema.Tuple([Schema.String, Schema.String]),
      ),
    }
  })
}

export class CoreDb extends Context.Service<
  CoreDb,
  Effect.Success<ReturnType<typeof makeCore>>
>()("social/CoreDb") {}

export function coreDbLayer(
  bindings: { readonly DB: D1Database } | D1Database,
) {
  const db = "DB" in bindings ? bindings.DB : bindings

  return Layer.effect(CoreDb, makeCore(db))
}
