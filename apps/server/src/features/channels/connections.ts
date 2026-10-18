import type { ConnectionProvider } from "@opencoredev/social-sdk/server"

import { ConnectionManager } from "@opencoredev/social-sdk/server"
import { DateTime, Effect, Schema } from "effect"
import { sdkError, sdkRequest } from "server/features/channels/sdk-request"
import {
  credentialKey,
  makeSdkStores,
} from "server/features/channels/sdk-stores"

import { ChannelsDb } from "db/services/channels"
import { SocialDb } from "db/services/channels/social"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import type { Platform } from "rpc/contracts/channels"
import { Channel, DiscoveredAccount } from "rpc/contracts/channels"
import { ApiError } from "rpc/lib/errors"

type SdkStores = Effect.Success<ReturnType<typeof makeSdkStores>>

export function makeConnectionOperations({
  config,
  provider,
  requirePlatform,
}: {
  config: Pick<AppConfig, "APP_ORIGIN">
  provider: (platform: Platform, stores: SdkStores) => ConnectionProvider
  requirePlatform: (platform: Platform) => Effect.Effect<void, ApiError>
}) {
  return Effect.gen(function* () {
    const workspacesDb = yield* WorkspacesDb
    const channelsDb = yield* ChannelsDb
    const db = yield* SocialDb

    return {
      begin(
        this: void,
        userId: string,
        workspaceId: string,
        platform: Platform,
        loginHint?: string,
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({
            userId,
            workspaceId,
            manage: true,
          })
          yield* requirePlatform(platform)

          const stores = yield* makeSdkStores({
            tenantId: workspaceId,
            principalId: userId,
          })

          const redirectUri = `${config.APP_ORIGIN}/social/callback/${platform}`

          const result = yield* sdkRequest(() =>
            new ConnectionManager({ store: stores.connections }).begin({
              backend: `direct:${workspaceId}:${platform}`,
              tenantId: workspaceId,
              principalId: userId,
              platforms: [platform],
              capabilities: [
                "posts.publish",
                "posts.read",
                "analytics.read",
                "analytics.account.read",
              ],
              redirectUri,
              allowedRedirectUris: [redirectUri],
              provider: provider(platform, stores),
              loginHint,
            }),
          )

          return { attemptId: result.attempt.id, url: result.authorizationUrl }
        })
      },
      discover(
        this: void,
        userId: string,
        workspaceId: string,
        attemptId: string,
        callbackUrl: string,
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({
            userId,
            workspaceId,
            manage: true,
          })
          const row = yield* db.attempt(attemptId)

          if (
            !row ||
            row.tenant_id !== workspaceId ||
            row.principal_id !== userId
          )
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Connection attempt is not owned by this principal",
              }),
            )
          yield* requirePlatform(row.platform)

          const stores = yield* makeSdkStores({
            tenantId: workspaceId,
            principalId: userId,
          })

          const url = yield* Effect.try({
            try: () => new URL(callbackUrl),
            catch: sdkError,
          })

          const accounts = yield* sdkRequest(() =>
            new ConnectionManager({ store: stores.connections }).discover({
              attemptId,
              tenantId: workspaceId,
              principalId: userId,
              callbackUrl,
              returnedState: url.searchParams.get("state") ?? "",
              allowedRedirectUris: [
                `${config.APP_ORIGIN}/social/callback/${row.platform}`,
              ],
              provider: provider(row.platform, stores),
            }),
          )

          return yield* Schema.decodeUnknownEffect(
            Schema.Array(DiscoveredAccount),
          )(
            accounts.map((account) => ({
              accountId: account.ref.accountId,
              platform: account.ref.platform,
              displayName: account.displayName,
            })),
          ).pipe(Effect.mapError(sdkError))
        })
      },
      discovered(
        this: void,
        userId: string,
        workspaceId: string,
        attemptId: string,
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({
            userId,
            workspaceId,
            manage: true,
          })
          const row = yield* db.attempt(attemptId)

          if (
            !row ||
            row.tenant_id !== workspaceId ||
            row.principal_id !== userId ||
            row.expires_at <= DateTime.formatIso(yield* DateTime.now)
          )
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Connection attempt unavailable",
              }),
            )

          const stores = yield* makeSdkStores({
            tenantId: workspaceId,
            principalId: userId,
          })

          const accounts = yield* sdkRequest(() =>
            stores.connections.getDiscoveredAccounts(attemptId),
          )

          return yield* Schema.decodeUnknownEffect(
            Schema.Array(DiscoveredAccount),
          )(
            (accounts ?? []).map((account) => ({
              accountId: account.ref.accountId,
              platform: account.ref.platform,
              displayName: account.displayName,
            })),
          ).pipe(Effect.mapError(sdkError))
        })
      },
      select(
        this: void,
        userId: string,
        workspaceId: string,
        attemptId: string,
        accountIds: readonly string[],
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({
            userId,
            workspaceId,
            manage: true,
          })

          const stores = yield* makeSdkStores({
            tenantId: workspaceId,
            principalId: userId,
          })

          const accounts = yield* sdkRequest(() =>
            stores.connections.getDiscoveredAccounts(attemptId),
          )

          const grants = yield* sdkRequest(() =>
            new ConnectionManager({ store: stores.connections }).select({
              attemptId,
              tenantId: workspaceId,
              principalId: userId,
              selectedAccountIds: accountIds,
            }),
          )

          return yield* Effect.forEach(
            grants,
            (grant) =>
              Effect.gen(function* () {
                const channel = yield* Schema.decodeUnknownEffect(Channel)({
                  id: `${workspaceId}:${grant.account.platform}:${grant.account.accountId}`,
                  workspaceId,
                  platform: grant.account.platform,
                  backend: grant.account.backend,
                  accountId: grant.account.accountId,
                  displayName:
                    accounts?.find(
                      (account) =>
                        account.ref.accountId === grant.account.accountId,
                    )?.displayName ?? grant.account.accountId,
                  status: "connected",
                }).pipe(Effect.mapError(sdkError))

                return channel
              }),
            { concurrency: 1 },
          )
        })
      },
      disconnect(
        this: void,
        userId: string,
        workspaceId: string,
        channelId: string,
      ) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({
            userId,
            workspaceId,
            manage: true,
          })
          const channel = yield* channelsDb.channel({ workspaceId, channelId })
          yield* db.revoke(
            workspaceId,
            channel.backend,
            channel.platform,
            channel.accountId,
          )
          yield* db.deleteCredential(
            credentialKey(
              workspaceId,
              channel.backend,
              channel.platform,
              channel.accountId,
            ),
          )
          yield* channelsDb.disconnectChannel({ workspaceId, channelId })
        })
      },
    }
  })
}
