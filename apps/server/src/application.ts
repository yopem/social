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
import { type DeletionDb, deletionDbLayer } from "db/services/accounts/deletion"
import type { SocialDb } from "db/services/channels/social"
import { socialDbLayer } from "db/services/channels/social"
import { type CoreDb, coreDbLayer } from "db/services/client"
import { type RetentionDb, retentionDbLayer } from "db/services/retention"
import type { SessionDb } from "db/services/session"
import { sessionDbLayer } from "db/services/session"
import type { AppConfig, WorkerBindings, WorkerResources } from "env/server"
import { ConfigService, resourceLayer } from "env/server"
import type { ApiError } from "rpc/lib/errors"

export type ApplicationDependencies =
  | AuthSession
  | CoreDb
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
    CoreDb | SessionDb | CredentialCrypto
  >
  readonly social?: Layer.Layer<
    SocialService,
    ApiError,
    CoreDb | SocialDb | CredentialCrypto | OperationGate
  >
  readonly egress?: Layer.Layer<Egress, ApiError>
}

export function applicationLayer(
  bindings: WorkerBindings,
  config: AppConfig,
  overrides: ApplicationOverrides = {},
) {
  const base = Layer.mergeAll(
    resourceLayer(bindings),
    Layer.succeed(ConfigService, config),
    coreDbLayer(bindings),
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
