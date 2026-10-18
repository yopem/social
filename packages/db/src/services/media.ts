import { sql, eq, and, inArray } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

import { media, MediaRow } from "db/schema/media"
import { memberships } from "db/schema/workspaces"
import { Database } from "db/services/client"
import type { DatabaseContext } from "db/services/context"
import { failure } from "db/services/context"
import { validateOperation } from "db/services/validation"
import { MediaListInput } from "rpc/contracts/media"
import { Media } from "rpc/contracts/media"

const MediaReferenceInput = Schema.Struct({
  workspaceId: Schema.String,
  mediaId: Schema.String,
})

const UserMediaInput = Schema.Struct({
  userId: Schema.String,
  mediaId: Schema.String,
})

export class MediaDb extends Context.Service<
  MediaDb,
  ReturnType<typeof createMediaRepository>
>()("social/MediaDb") {
  static readonly layer = Layer.effect(
    MediaDb,
    Effect.map(Database, createMediaRepository),
  )
}

export function createMediaRepository(context: DatabaseContext) {
  const { client, query, write, required } = context

  const mediaOperations = {
    listMedia: Effect.fn("media.listMedia")(function* (
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
    media(
      this: void,
      { workspaceId, mediaId: id }: typeof MediaReferenceInput.Type,
    ) {
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
    mediaById(this: void, { userId, mediaId: id }: typeof UserMediaInput.Type) {
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
    deleteUnusedMedia(
      this: void,
      { workspaceId, mediaId: id }: typeof MediaReferenceInput.Type,
    ) {
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
  }

  return {
    listMedia: validateOperation(
      mediaOperations.listMedia,
      Schema.Tuple([MediaListInput]),
    ),
    saveMedia: validateOperation(
      mediaOperations.saveMedia,
      Schema.Tuple([
        Schema.Struct({ ...Media.fields, objectKey: Schema.String }),
      ]),
    ),
    media: validateOperation(
      mediaOperations.media,
      Schema.Tuple([MediaReferenceInput]),
    ),
    mediaById: validateOperation(
      mediaOperations.mediaById,
      Schema.Tuple([UserMediaInput]),
    ),
    deleteUnusedMedia: validateOperation(
      mediaOperations.deleteUnusedMedia,
      Schema.Tuple([MediaReferenceInput]),
    ),
  }
}
