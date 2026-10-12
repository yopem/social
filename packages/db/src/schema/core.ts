import { Schema } from "effect"

import {
  Channel,
  Delivery,
  Feed,
  Media,
  PostContent,
  PostState,
  User,
  Workspace,
} from "rpc/contracts/models"

export const UserRow = User

export const WorkspaceRow = Workspace

export const ChannelRow = Schema.Struct({ data: Schema.parseJson(Channel) })

export const DeliveryRow = Schema.Struct({ data: Schema.parseJson(Delivery) })

export const FeedRow = Schema.Struct({ data: Schema.parseJson(Feed) })

export const StoredMedia = Schema.Struct({
  ...Media.fields,
  objectKey: Schema.String,
})

export type StoredMedia = typeof StoredMedia.Type

export const MediaRow = Schema.Struct({
  data: Schema.parseJson(Media),
  object_key: Schema.String,
})

export const PostRow = Schema.Struct({
  id: Schema.String,
  workspace_id: Schema.String,
  content: Schema.parseJson(PostContent),
  state: PostState,
  scheduled_at: Schema.NullOr(Schema.String),
  created_at: Schema.String,
  updated_at: Schema.String,
  review_reason: Schema.NullOr(Schema.String),
})

export const AuthAttempt = Schema.Struct({
  state: Schema.String,
  nonceHash: Schema.String,
  verifier: Schema.String,
  expiresAt: Schema.String,
})

export type AuthAttempt = typeof AuthAttempt.Type

export const ConsumedAuthAttempt = Schema.Struct({ verifier: Schema.String })
