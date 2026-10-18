import { sql, eq, and } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

import { channels, ChannelRow } from "db/schema/channels"
import { Database } from "db/services/client"
import type { DatabaseContext } from "db/services/context"
import { failure } from "db/services/context"
import { validateOperation } from "db/services/validation"
import { Channel, ChannelInput } from "rpc/contracts/channels"

export class ChannelsDb extends Context.Service<
  ChannelsDb,
  ReturnType<typeof createChannelsRepository>
>()("social/ChannelsDb") {
  static readonly layer = Layer.effect(
    ChannelsDb,
    Effect.map(Database, createChannelsRepository),
  )
}

export function createChannelsRepository(context: DatabaseContext) {
  const { client, query, write, required } = context

  function channel({ workspaceId, channelId: id }: typeof ChannelInput.Type) {
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

  const channelOperations = {
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
    disconnectChannel(
      this: void,
      { workspaceId, channelId: id }: typeof ChannelInput.Type,
    ) {
      return channel({ workspaceId, channelId: id }).pipe(
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
      channelOperations.channel,
      Schema.Tuple([ChannelInput]),
    ),
    listChannels: validateOperation(
      channelOperations.listChannels,
      Schema.Tuple([Schema.String]),
    ),
    upsertChannel: validateOperation(
      channelOperations.upsertChannel,
      Schema.Tuple([Channel]),
    ),
    disconnectChannel: validateOperation(
      channelOperations.disconnectChannel,
      Schema.Tuple([ChannelInput]),
    ),
  }
}
