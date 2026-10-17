import { Effect, Schema } from "effect"

import { CredentialCrypto } from "auth/services/crypto"
import { SocialDb } from "db/services/channels/social"
import { Platform } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"
import { JsonValueSchema } from "rpc/lib/json"

export const EventSchema = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  backend: Schema.String,
  provider: Platform,
  type: Schema.Literals([
    "publication.updated",
    "post.removed",
    "backend-record.deleted",
    "account.updated",
    "message.received",
    "comment.received",
    "unknown",
  ]),
  identity: Schema.Literals(["provider-event-id", "body-digest"]),
  originalType: Schema.String,
  occurredAt: Schema.optional(Schema.String),
  receivedAt: Schema.String,
  accountIds: Schema.Array(Schema.String),
  backendRecordId: Schema.optional(Schema.String),
  data: Schema.Record(Schema.String, JsonValueSchema),
})

export type SocialWebhookEvent = typeof EventSchema.Type

export function drainSocialInbox<E, R>(
  process: (
    event: SocialWebhookEvent,
    workspaceId: string,
  ) => Effect.Effect<void, E, R>,
) {
  return Effect.gen(function* () {
    const db = yield* SocialDb
    const cipher = yield* CredentialCrypto
    const pending = yield* db.pendingInbox()

    for (const row of pending) {
      const event = yield* cipher.decrypt(row.data).pipe(
        Effect.flatMap((data) =>
          Schema.decodeUnknownEffect(Schema.fromJsonString(EventSchema))(data),
        ),
        Effect.mapError(
          () =>
            new ApiError({
              code: "storage-failure",
              message: "Stored webhook event is invalid",
            }),
        ),
      )

      const tenants = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(Schema.Array(Schema.String)),
      )(row.tenants).pipe(
        Effect.mapError(
          () =>
            new ApiError({
              code: "storage-failure",
              message: "Stored webhook routes are invalid",
            }),
        ),
      )

      yield* Effect.forEach(tenants, (tenant) => process(event, tenant), {
        concurrency: 1,
        discard: true,
      })
      yield* db.completeInbox(row.key)
    }

    return pending.length
  })
}
