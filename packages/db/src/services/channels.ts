import { sql, eq, and } from "drizzle-orm"
import { Effect, Schema } from "effect"

import { channels, ChannelRow } from "db/schema/channels"
import type { CoreContext } from "db/services/core"
import { failure } from "db/services/core"
import { validateOperation } from "db/services/validation"
import { Channel } from "rpc/contracts/channels"

export function createChannelsRepository(context: CoreContext) {
  const { client, query, write, required } = context

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
    channel,
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
  }

  return {
    channel: validateOperation(
      operations.channel,
      Schema.Tuple([Schema.String, Schema.String]),
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
  }
}
