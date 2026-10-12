import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types"

import * as D1Client from "@effect/sql-d1/D1Client"
import { Context, DateTime, Effect, Layer, Match, Option, Schema } from "effect"

import {
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
import type { WorkspaceKind } from "rpc/contracts/models"
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
  return Effect.gen(function* () {
    const sql = yield* D1Client.D1Client

    function query<A, I>(
      schema: Schema.Schema<A, I>,
      statement: string,
      parameters: readonly (string | number | null)[] = [],
    ) {
      return sql.unsafe(statement, parameters).pipe(
        Effect.flatMap(Schema.decodeUnknown(Schema.Array(schema))),
        Effect.mapError(() =>
          failure("storage-failure", "Database operation failed"),
        ),
      )
    }

    function write(
      statement: string,
      parameters: readonly (string | number | null)[] = [],
    ) {
      return sql.unsafe(statement, parameters).pipe(
        Effect.asVoid,
        Effect.mapError(() =>
          failure("storage-failure", "Database write failed"),
        ),
      )
    }

    function batch(statements: readonly D1PreparedStatement[]) {
      return Effect.tryPromise({
        try: () => db.batch([...statements]),
        catch: () => failure("storage-failure", "Atomic database write failed"),
      }).pipe(Effect.asVoid)
    }

    function required<A>(rows: readonly A[]) {
      return rows[0] === undefined
        ? Effect.fail(failure("not-found", "Record not found"))
        : Effect.succeed(rows[0])
    }

    function getUser(issuer: string, subjectId: string) {
      return query(
        UserRow,
        "SELECT id,name,email FROM users WHERE issuer=? AND subject_id=?",
        [issuer, subjectId],
      ).pipe(Effect.map((rows) => rows[0] ?? null))
    }

    function workspaceAccess(
      userId: string,
      workspaceId: string,
      manage = false,
    ) {
      return query(
        WorkspaceRow,
        "SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE w.id=? AND m.user_id=?",
        [workspaceId, userId],
      ).pipe(
        Effect.flatMap((rows) =>
          rows[0] && (!manage || rows[0].role !== "editor")
            ? Effect.succeed(rows[0])
            : Effect.fail(failure("forbidden", "Workspace access denied")),
        ),
      )
    }

    function listWorkspaces(userId: string) {
      return query(
        WorkspaceRow,
        "SELECT w.*,m.role FROM workspaces w JOIN memberships m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.id LIMIT 100",
        [userId],
      )
    }

    function getPost(workspaceId: string, id: string) {
      return Effect.gen(function* () {
        const row = yield* query(
          PostRow,
          "SELECT * FROM posts WHERE workspace_id=? AND id=?",
          [workspaceId, id],
        ).pipe(Effect.flatMap(required))

        const deliveries = yield* query(
          DeliveryRow,
          "SELECT data FROM deliveries WHERE post_id=? ORDER BY id LIMIT 40",
          [id],
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
          deliveries: deliveries.map((item) => item.data),
        }
      })
    }

    function getFeed(workspaceId: string, id: string) {
      return query(
        FeedRow,
        "SELECT data FROM feeds WHERE workspace_id=? AND id=?",
        [workspaceId, id],
      ).pipe(
        Effect.flatMap(required),
        Effect.map((row) => row.data),
      )
    }

    function channel(workspaceId: string, id: string) {
      return query(
        ChannelRow,
        "SELECT data FROM channels WHERE workspace_id=? AND id=?",
        [workspaceId, id],
      ).pipe(
        Effect.flatMap(required),
        Effect.map((row) => row.data),
      )
    }

    return {
      getUser,
      automationPrincipal(workspaceId: string) {
        return query(
          UserRow,
          "SELECT u.id,u.name,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.role='owner'",
          [workspaceId],
        ).pipe(Effect.flatMap(required))
      },
      workspaceAccess,
      listWorkspaces,
      getPost,
      getFeed,
      channel,
      provisionUser(
        issuer: string,
        subject: {
          readonly id: string
          readonly email: string
          readonly name: string | null
        },
      ) {
        return Effect.gen(function* () {
          const subjectName = subject.name?.trim() ?? ""

          const user = yield* Schema.decodeUnknown(User)({
            id: crypto.randomUUID(),
            name: subjectName.length > 0 ? subjectName : subject.email,
            email: subject.email,
          }).pipe(
            Effect.mapError(() => failure("invalid-input", "Invalid user")),
          )

          const workspaceId = crypto.randomUUID()
          yield* batch([
            db
              .prepare(
                "INSERT INTO users(id,issuer,subject_id,name,email,initial_workspace_id) VALUES(?,?,?,?,?,?) ON CONFLICT(issuer,subject_id) DO UPDATE SET name=excluded.name,email=excluded.email",
              )
              .bind(
                user.id,
                issuer,
                subject.id,
                user.name,
                user.email,
                workspaceId,
              ),
            db
              .prepare(
                "INSERT OR IGNORE INTO workspaces(id,name,kind,timezone) SELECT initial_workspace_id,name,'personal','UTC' FROM users WHERE issuer=? AND subject_id=?",
              )
              .bind(issuer, subject.id),
            db
              .prepare(
                "INSERT OR IGNORE INTO memberships(workspace_id,user_id,role) SELECT initial_workspace_id,id,'owner' FROM users WHERE issuer=? AND subject_id=?",
              )
              .bind(issuer, subject.id),
          ])
          const saved = yield* getUser(issuer, subject.id)

          if (saved === null)
            return yield* Effect.fail(
              failure("storage-failure", "User provisioning failed"),
            )

          return saved
        })
      },
      createWorkspace(
        userId: string,
        name: string,
        kind: typeof WorkspaceKind.Type,
        timezone: string,
      ) {
        return Effect.gen(function* () {
          const value = yield* Schema.decodeUnknown(Workspace)({
            id: crypto.randomUUID(),
            name,
            kind,
            timezone,
            role: "owner",
          }).pipe(
            Effect.mapError(() =>
              failure("invalid-input", "Invalid workspace"),
            ),
          )

          yield* batch([
            db
              .prepare("INSERT INTO workspaces VALUES(?,?,?,?)")
              .bind(value.id, value.name, value.kind, value.timezone),
            db
              .prepare("INSERT INTO memberships VALUES(?,?,'owner')")
              .bind(value.id, userId),
          ])

          return value
        })
      },
      members(userId: string, workspaceId: string) {
        return workspaceAccess(userId, workspaceId).pipe(
          Effect.zipRight(
            query(
              Schema.Struct({
                id: Schema.String,
                name: Schema.String,
                email: Schema.String,
                role: Role,
              }),
              "SELECT u.id,u.name,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? ORDER BY u.id LIMIT 100",
              [workspaceId],
            ),
          ),
          Effect.flatMap((rows) =>
            Schema.decodeUnknown(Schema.Array(Member))(
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
      invite(
        userId: string,
        workspaceId: string,
        email: string,
        role: "admin" | "editor",
      ) {
        return Effect.gen(function* () {
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
          yield* write("INSERT INTO invites VALUES(?,?,?,?,?,NULL,NULL)", [
            digest,
            workspaceId,
            email.toLowerCase(),
            role,
            yield* now(7 * 86400000),
          ])

          return { token }
        })
      },
      acceptInvite(user: User, token: string) {
        return Effect.gen(function* () {
          const digest = yield* hash(token)
          const claim = crypto.randomUUID()
          yield* batch([
            db
              .prepare(
                "UPDATE invites SET consumed_by=?,claim_key=? WHERE token_hash=? AND email=lower(?) AND expires_at>? AND consumed_by IS NULL",
              )
              .bind(user.id, claim, digest, user.email, yield* now()),
            db
              .prepare(
                "INSERT INTO memberships(workspace_id,user_id,role) SELECT workspace_id,consumed_by,role FROM invites WHERE token_hash=? AND claim_key=? ON CONFLICT(workspace_id,user_id) DO NOTHING",
              )
              .bind(digest, claim),
          ])

          const invite = yield* query(
            Schema.Struct({ workspace_id: Schema.String }),
            "SELECT workspace_id FROM invites WHERE token_hash=? AND claim_key=?",
            [digest, claim],
          ).pipe(Effect.flatMap(required))

          return yield* workspaceAccess(user.id, invite.workspace_id)
        })
      },
      removeMember(userId: string, workspaceId: string, memberId: string) {
        return Effect.gen(function* () {
          yield* workspaceAccess(userId, workspaceId, true)

          if (userId === memberId)
            return yield* Effect.fail(
              failure("invalid-input", "Cannot remove yourself"),
            )

          const rows = yield* query(
            Schema.Struct({ user_id: Schema.String }),
            "DELETE FROM memberships WHERE workspace_id=? AND user_id=? AND role!='owner' RETURNING user_id",
            [workspaceId, memberId],
          )

          if (!rows.length)
            return yield* Effect.fail(
              failure(
                "forbidden",
                "Cannot remove workspace owner or absent member",
              ),
            )
        })
      },
      // Callers must check workspaceAccess before internal workspace-only operations.
      listChannels(workspaceId: string) {
        return query(
          ChannelRow,
          "SELECT data FROM channels WHERE workspace_id=? ORDER BY id LIMIT 100",
          [workspaceId],
        ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
      },
      upsertChannel(value: Channel) {
        return Schema.decodeUnknown(Channel)(value).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid channel")),
          Effect.flatMap((row) =>
            write(
              "INSERT INTO channels VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE channels.workspace_id=excluded.workspace_id",
              [row.id, row.workspaceId, JSON.stringify(row)],
            ),
          ),
        )
      },
      disconnectChannel(workspaceId: string, id: string) {
        return channel(workspaceId, id).pipe(
          Effect.flatMap((value) =>
            write("UPDATE channels SET data=? WHERE workspace_id=? AND id=?", [
              JSON.stringify({ ...value, status: "disconnected" }),
              workspaceId,
              id,
            ]),
          ),
        )
      },
      listPosts(
        workspaceId: string,
        filter: "all" | "draft" | "queue" | "sent",
      ) {
        const states = Match.value(filter).pipe(
          Match.when("draft", () => "AND state IN ('draft','needs-review')"),
          Match.when("queue", () => "AND state IN ('scheduled','pending')"),
          Match.when(
            "sent",
            () => "AND state IN ('published','partial','failed')",
          ),
          Match.orElse(() => ""),
        )

        return query(
          Schema.Struct({ id: Schema.String }),
          `SELECT id FROM posts WHERE workspace_id=? ${states} ORDER BY created_at DESC LIMIT 100`,
          [workspaceId],
        ).pipe(
          Effect.flatMap((rows) =>
            Effect.forEach(rows, (row) => getPost(workspaceId, row.id), {
              concurrency: 4,
            }),
          ),
        )
      },
      savePost(
        workspaceId: string,
        content: PostContent,
        scheduledAt: string | null,
        postId?: string,
      ) {
        return Effect.gen(function* () {
          const valid = yield* Schema.decodeUnknown(PostContent)(content).pipe(
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
            yield* query(
              MediaRow,
              "SELECT data,object_key FROM media WHERE workspace_id=? AND id=?",
              [workspaceId, id],
            ).pipe(Effect.flatMap(required))
          const id = postId ?? crypto.randomUUID()
          const stamp = yield* now()

          if (postId) {
            const updated = yield* query(
              Schema.Struct({ id: Schema.String }),
              "UPDATE posts SET content=?,scheduled_at=?,state=?,updated_at=?,review_reason=NULL WHERE workspace_id=? AND id=? AND state IN ('draft','scheduled','needs-review','cancelled') AND operation_key IS NULL RETURNING id",
              [
                JSON.stringify(valid),
                scheduledAt,
                scheduledAt ? "scheduled" : "draft",
                stamp,
                workspaceId,
                id,
              ],
            )

            if (!updated.length)
              return yield* Effect.fail(
                failure("conflict", "Post cannot be edited"),
              )
          } else
            yield* write(
              "INSERT INTO posts(id,workspace_id,content,state,scheduled_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
              [
                id,
                workspaceId,
                JSON.stringify(valid),
                scheduledAt ? "scheduled" : "draft",
                scheduledAt,
                stamp,
                stamp,
              ],
            )

          return yield* getPost(workspaceId, id)
        })
      },
      setPostState(
        workspaceId: string,
        id: string,
        state: typeof PostState.Type,
        reviewReason: string | null = null,
      ) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* Schema.decodeUnknown(PostState)(state).pipe(
            Effect.mapError(() =>
              failure("invalid-input", "Invalid post state"),
            ),
            Effect.flatMap((valid) =>
              query(
                Schema.Struct({ id: Schema.String }),
                "UPDATE posts SET state=?,review_reason=?,updated_at=? WHERE workspace_id=? AND id=? RETURNING id",
                [valid, reviewReason, stamp, workspaceId, id],
              ),
            ),
            Effect.flatMap(required),
            Effect.asVoid,
          )
        })
      },
      saveDelivery(value: Delivery) {
        return Schema.decodeUnknown(Delivery)(value).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid delivery")),
          Effect.flatMap((row) =>
            query(
              Schema.Struct({ id: Schema.String }),
              "INSERT INTO deliveries(id,post_id,channel_id,data) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM posts p JOIN channels c ON c.workspace_id=p.workspace_id WHERE p.id=? AND c.id=? AND json_extract(c.data,'$.platform')=?) ON CONFLICT(post_id,channel_id) DO UPDATE SET data=excluded.data RETURNING id",
              [
                row.id,
                row.postId,
                row.channelId,
                JSON.stringify(row),
                row.postId,
                row.channelId,
                row.platform,
              ],
            ),
          ),
          Effect.flatMap(required),
          Effect.asVoid,
        )
      },
      cancelPost(workspaceId: string, id: string) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* query(
            Schema.Struct({ id: Schema.String }),
            "UPDATE posts SET state='cancelled',updated_at=? WHERE workspace_id=? AND id=? AND state IN ('draft','scheduled','needs-review') AND operation_key IS NULL RETURNING id",
            [stamp, workspaceId, id],
          ).pipe(
            Effect.flatMap(required),
            Effect.zipRight(getPost(workspaceId, id)),
          )
        })
      },
      deletePost(workspaceId: string, id: string) {
        return query(
          Schema.Struct({ id: Schema.String }),
          "DELETE FROM posts WHERE workspace_id=? AND id=? AND state IN ('draft','cancelled','needs-review') AND operation_key IS NULL RETURNING id",
          [workspaceId, id],
        ).pipe(Effect.flatMap(required), Effect.asVoid)
      },
      claimPost(workspaceId: string, id: string, operationKey: string) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* query(
            Schema.Struct({ id: Schema.String }),
            "UPDATE posts SET state='pending',operation_key=?,dispatch_status='dispatching',lease_until=NULL,updated_at=? WHERE workspace_id=? AND id=? AND ((state IN ('draft','scheduled') AND operation_key IS NULL AND ? NOT LIKE 'scheduled:%') OR (state='pending' AND dispatch_status IN ('leased','enqueued') AND operation_key=?)) RETURNING id",
            [operationKey, stamp, workspaceId, id, operationKey, operationKey],
          ).pipe(Effect.map((rows) => rows.length === 1))
        })
      },
      claimDuePosts(limit: number) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* query(
            Schema.Struct({ id: Schema.String, workspace_id: Schema.String }),
            "UPDATE posts SET state='pending',operation_key='scheduled:'||id,dispatch_status='leased',lease_until=?,updated_at=? WHERE id IN (SELECT id FROM posts WHERE (state='scheduled' AND scheduled_at<=? AND operation_key IS NULL) OR (state='pending' AND dispatch_status='leased' AND lease_until<=?) ORDER BY scheduled_at LIMIT ?) AND ((state='scheduled' AND operation_key IS NULL) OR (state='pending' AND dispatch_status='leased' AND lease_until<=?)) RETURNING id,workspace_id",
            [
              yield* now(300000),
              stamp,
              stamp,
              stamp,
              Math.max(1, Math.min(100, Math.floor(limit))),
              stamp,
            ],
          ).pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) => getPost(row.workspace_id, row.id), {
                concurrency: 4,
              }),
            ),
          )
        })
      },
      markPostEnqueued(workspaceId: string, id: string, operationKey: string) {
        return write(
          "UPDATE posts SET dispatch_status='enqueued',lease_until=NULL WHERE workspace_id=? AND id=? AND state='pending' AND operation_key=? AND dispatch_status='leased'",
          [workspaceId, id, operationKey],
        )
      },
      saveMedia(value: Media & { readonly objectKey: string }) {
        return Schema.decodeUnknown(Media)(value).pipe(
          Effect.mapError(() => failure("invalid-input", "Invalid media")),
          Effect.flatMap((row) =>
            write("INSERT INTO media VALUES(?,?,?,?)", [
              row.id,
              row.workspaceId,
              value.objectKey,
              JSON.stringify({
                ...row,
                url: `/media/${encodeURIComponent(row.id)}`,
              }),
            ]),
          ),
        )
      },
      media(workspaceId: string, id: string) {
        return query(
          MediaRow,
          "SELECT data,object_key FROM media WHERE workspace_id=? AND id=?",
          [workspaceId, id],
        ).pipe(
          Effect.flatMap(required),
          Effect.map((row) => ({ ...row.data, objectKey: row.object_key })),
        )
      },
      mediaById(userId: string, id: string) {
        return query(
          MediaRow,
          "SELECT media.data,media.object_key FROM media JOIN memberships m ON m.workspace_id=media.workspace_id WHERE m.user_id=? AND media.id=?",
          [userId, id],
        ).pipe(
          Effect.flatMap(required),
          Effect.map((row) => ({ ...row.data, objectKey: row.object_key })),
        )
      },
      holdPost(workspaceId: string, id: string, reason: string) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          const rows = yield* query(
            Schema.Struct({ id: Schema.String }),
            "UPDATE posts SET state='needs-review',review_reason=?,operation_key=NULL,dispatch_status=NULL,lease_until=NULL,updated_at=? WHERE workspace_id=? AND id=? AND (operation_key IS NULL OR dispatch_status IN ('leased','enqueued')) RETURNING id",
            [reason, stamp, workspaceId, id],
          )

          if (!rows.length)
            return yield* Effect.fail(
              failure("conflict", "Post cannot be held after dispatch"),
            )
        })
      },
      listFeeds(workspaceId: string) {
        return query(
          FeedRow,
          "SELECT data FROM feeds WHERE workspace_id=? ORDER BY id LIMIT 100",
          [workspaceId],
        ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
      },
      saveFeed(
        workspaceId: string,
        config: Omit<Feed, "id" | "workspaceId" | "lastCheckedAt" | "error">,
        feedId?: string,
      ) {
        return Effect.gen(function* () {
          const old = feedId ? yield* getFeed(workspaceId, feedId) : null

          const value = yield* Schema.decodeUnknown(Feed)({
            ...config,
            id: feedId ?? crypto.randomUUID(),
            workspaceId,
            lastCheckedAt: old?.lastCheckedAt ?? null,
            error: old?.error ?? null,
          }).pipe(
            Effect.mapError(() => failure("invalid-input", "Invalid feed")),
          )

          for (const id of value.channelIds) yield* channel(workspaceId, id)
          yield* write(
            "INSERT INTO feeds VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE feeds.workspace_id=excluded.workspace_id",
            [value.id, workspaceId, JSON.stringify(value), value.lastCheckedAt],
          )

          return value
        })
      },
      deleteFeed(workspaceId: string, id: string) {
        return write("DELETE FROM feeds WHERE workspace_id=? AND id=?", [
          workspaceId,
          id,
        ])
      },
      importFeedPost(
        workspaceId: string,
        feedId: string,
        itemKey: string,
        content: PostContent,
        reviewReason?: string,
      ) {
        return Effect.gen(function* () {
          yield* getFeed(workspaceId, feedId)

          const valid = yield* Schema.decodeUnknown(PostContent)(content).pipe(
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
            yield* query(
              MediaRow,
              "SELECT data,object_key FROM media WHERE workspace_id=? AND id=?",
              [workspaceId, id],
            ).pipe(Effect.flatMap(required))
          const postId = crypto.randomUUID()
          const stamp = yield* now()
          yield* batch([
            db
              .prepare(
                "INSERT INTO posts(id,workspace_id,content,state,created_at,updated_at,review_reason) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM feeds WHERE id=? AND workspace_id=?) AND NOT EXISTS(SELECT 1 FROM feed_items WHERE feed_id=? AND item_key=?)",
              )
              .bind(
                postId,
                workspaceId,
                JSON.stringify(valid),
                reviewReason ? "needs-review" : "draft",
                stamp,
                stamp,
                reviewReason ?? null,
                feedId,
                workspaceId,
                feedId,
                itemKey,
              ),
            db
              .prepare(
                "INSERT INTO feed_items(feed_id,item_key,claimed_at,post_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM posts WHERE id=?) ON CONFLICT(feed_id,item_key) DO NOTHING",
              )
              .bind(feedId, itemKey, stamp, postId, postId),
          ])

          const item = yield* query(
            Schema.Struct({ post_id: Schema.NullOr(Schema.String) }),
            "SELECT i.post_id FROM feed_items i JOIN feeds f ON f.id=i.feed_id WHERE i.feed_id=? AND i.item_key=? AND f.workspace_id=?",
            [feedId, itemKey, workspaceId],
          ).pipe(Effect.flatMap(required))

          if (!item.post_id)
            return yield* Effect.fail(
              failure("conflict", "Feed item has no stored post"),
            )

          return {
            post: yield* getPost(workspaceId, item.post_id),
            created: item.post_id === postId,
          }
        })
      },
      findImportedPost(workspaceId: string, feedId: string, itemKey: string) {
        return query(
          Schema.Struct({ post_id: Schema.NullOr(Schema.String) }),
          "SELECT i.post_id FROM feed_items i JOIN feeds f ON f.id=i.feed_id WHERE f.workspace_id=? AND i.feed_id=? AND i.item_key=?",
          [workspaceId, feedId, itemKey],
        ).pipe(
          Effect.flatMap((rows) =>
            rows[0]?.post_id
              ? getPost(workspaceId, rows[0].post_id)
              : Effect.succeed(null),
          ),
        )
      },
      listPendingPosts(limit: number) {
        return Effect.gen(function* () {
          return yield* query(
            Schema.Struct({ id: Schema.String, workspace_id: Schema.String }),
            "SELECT id,workspace_id FROM posts WHERE state='pending' AND dispatch_status='dispatching' AND updated_at<? ORDER BY updated_at LIMIT ?",
            [
              yield* now(-300000),
              Math.max(1, Math.min(100, Math.floor(limit))),
            ],
          ).pipe(
            Effect.flatMap((rows) =>
              Effect.forEach(rows, (row) => getPost(row.workspace_id, row.id), {
                concurrency: 4,
              }),
            ),
          )
        })
      },
      deleteUnusedMedia(workspaceId: string, id: string) {
        return query(
          Schema.Struct({ object_key: Schema.String }),
          "DELETE FROM media WHERE workspace_id=? AND id=? AND NOT EXISTS(SELECT 1 FROM posts p,json_each(p.content,'$.mediaIds') m WHERE p.workspace_id=media.workspace_id AND m.value=media.id) RETURNING object_key",
          [workspaceId, id],
        ).pipe(
          Effect.map((rows) =>
            rows[0] ? { objectKey: rows[0].object_key } : null,
          ),
        )
      },
      claimFeedItem(feedId: string, itemKey: string) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* query(
            Schema.Struct({ item_key: Schema.String }),
            "INSERT INTO feed_items(feed_id,item_key,claimed_at) VALUES(?,?,?) ON CONFLICT DO NOTHING RETURNING item_key",
            [feedId, itemKey, stamp],
          ).pipe(Effect.map((rows) => rows.length === 1))
        })
      },
      listDueFeeds(limit: number) {
        return Effect.gen(function* () {
          return yield* query(
            FeedRow,
            "SELECT data FROM feeds WHERE json_extract(data,'$.enabled')=1 AND (last_checked_at IS NULL OR last_checked_at<?) ORDER BY last_checked_at LIMIT ?",
            [
              yield* now(-900000),
              Math.max(1, Math.min(100, Math.floor(limit))),
            ],
          ).pipe(Effect.map((rows) => rows.map((row) => row.data)))
        })
      },
      recordFeedCheck(workspaceId: string, id: string, error: string | null) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* write(
            "UPDATE feeds SET data=json_set(data,'$.lastCheckedAt',?,'$.error',?),last_checked_at=? WHERE workspace_id=? AND id=?",
            [stamp, error, stamp, workspaceId, id],
          )
        })
      },
      saveAuthAttempt(value: typeof AuthAttempt.Type) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* Schema.decodeUnknown(AuthAttempt)(value).pipe(
            Effect.mapError(() =>
              failure("invalid-input", "Invalid auth attempt"),
            ),
            Effect.flatMap((row) =>
              batch([
                db
                  .prepare(
                    "DELETE FROM auth_attempts WHERE state IN (SELECT state FROM auth_attempts WHERE expires_at<? ORDER BY expires_at LIMIT 100)",
                  )
                  .bind(stamp),
                db
                  .prepare("INSERT INTO auth_attempts VALUES(?,?,?,?,NULL)")
                  .bind(row.state, row.nonceHash, row.verifier, row.expiresAt),
              ]),
            ),
          )
        })
      },
      consumeAuthAttempt(state: string, nonceHash: string) {
        return Effect.gen(function* () {
          const stamp = yield* now()

          return yield* query(
            ConsumedAuthAttempt,
            "UPDATE auth_attempts SET consumed_at=? WHERE state=? AND nonce_hash=? AND expires_at>? AND consumed_at IS NULL RETURNING verifier",
            [stamp, state, nonceHash, stamp],
          ).pipe(
            Effect.flatMap((rows) =>
              rows[0]
                ? Effect.succeed(rows[0])
                : Effect.fail(
                    failure("invalid-input", "Invalid or expired OAuth state"),
                  ),
            ),
          )
        })
      },
    }
  })
}

export class CoreDb extends Context.Tag("social/CoreDb")<
  CoreDb,
  Effect.Effect.Success<ReturnType<typeof makeCore>>
>() {}

export function coreDbLayer(
  bindings: { readonly DB: D1Database } | D1Database,
) {
  const db = "DB" in bindings ? bindings.DB : bindings

  return Layer.effect(CoreDb, makeCore(db)).pipe(
    Layer.provide(D1Client.layer({ db })),
  )
}
