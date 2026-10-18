import type { AccountDeletion } from "server/features/accounts/deletion"
import type { OperationGate } from "server/features/accounts/operation-gate"
import type { SocialService } from "server/features/channels/service"
import type { FeedService } from "server/features/feeds/service"
import type { Egress } from "server/platform/egress"

import { Layer } from "effect"
import { accountDeletionLayer } from "server/features/accounts/deletion"
import { operationGateLayer } from "server/features/accounts/operation-gate"
import { socialLayer } from "server/features/channels/service"
import { feedLayer } from "server/features/feeds/service"
import { type MediaService, mediaLayer } from "server/features/media/service"
import { type PostService, postLayer } from "server/features/posts/service"
import { type JobService, jobLayer } from "server/features/publishing/jobs"
import { egressLayer } from "server/platform/egress"

import type { CredentialCrypto } from "auth/services/crypto"
import { credentialCryptoLayer } from "auth/services/crypto"
import { type AuthSession, authSessionLayer } from "auth/services/session"
import { AccountsDb } from "db/services/accounts"
import { type DeletionDb, deletionDbLayer } from "db/services/accounts/deletion"
import { ChannelsDb } from "db/services/channels"
import type { SocialDb } from "db/services/channels/social"
import { socialDbLayer } from "db/services/channels/social"
import { type Database, databaseLayer } from "db/services/client"
import { FeedsDb } from "db/services/feeds"
import { MediaDb } from "db/services/media"
import { PostsDb } from "db/services/posts"
import { type RetentionDb, retentionDbLayer } from "db/services/retention"
import type { SessionDb } from "db/services/session"
import { sessionDbLayer } from "db/services/session"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig, WorkerBindings, WorkerResources } from "env/server"
import { ConfigService, resourceLayer } from "env/server"
import type { ApiError } from "rpc/lib/errors"

export type ApplicationDependencies =
  | AuthSession
  | Database
  | AccountsDb
  | WorkspacesDb
  | ChannelsDb
  | PostsDb
  | MediaDb
  | FeedsDb
  | DeletionDb
  | SessionDb
  | RetentionDb
  | AccountDeletion
  | OperationGate
  | SocialDb
  | CredentialCrypto
  | SocialService
  | JobService
  | MediaService
  | PostService
  | FeedService
  | WorkerResources
  | ConfigService
  | Egress

export interface ApplicationOverrides {
  readonly auth?: Layer.Layer<
    AuthSession,
    ApiError,
    AccountsDb | SessionDb | CredentialCrypto
  >
  readonly social?: Layer.Layer<
    SocialService,
    ApiError,
    | WorkspacesDb
    | ChannelsDb
    | PostsDb
    | SocialDb
    | CredentialCrypto
    | OperationGate
  >
  readonly egress?: Layer.Layer<Egress, ApiError>
}

export function applicationLayer(
  bindings: WorkerBindings,
  config: AppConfig,
  overrides: ApplicationOverrides = {},
) {
  const database = databaseLayer(bindings)
  const channels = ChannelsDb.layer.pipe(Layer.provideMerge(database))
  const posts = PostsDb.layer.pipe(Layer.provideMerge(channels))

  const repositories = Layer.mergeAll(
    AccountsDb.layer,
    WorkspacesDb.layer,
    MediaDb.layer,
    FeedsDb.layer,
  ).pipe(Layer.provideMerge(posts))

  const base = Layer.mergeAll(
    resourceLayer(bindings),
    Layer.succeed(ConfigService, config),
    repositories,
    deletionDbLayer(bindings.DB),
    sessionDbLayer(bindings.DB),
    retentionDbLayer(bindings.DB),
    socialDbLayer(bindings.DB),
    credentialCryptoLayer(config),
    overrides.egress ?? egressLayer,
  )

  const guarded = operationGateLayer.pipe(Layer.provideMerge(base))

  const services = Layer.mergeAll(
    overrides.auth ?? authSessionLayer(config),
    overrides.social ?? socialLayer(config),
    mediaLayer(bindings, config),
  ).pipe(Layer.provideMerge(guarded))

  const domain = Layer.mergeAll(
    postLayer,
    feedLayer,
    accountDeletionLayer,
  ).pipe(Layer.provideMerge(services))

  return jobLayer().pipe(Layer.provideMerge(domain))
}
