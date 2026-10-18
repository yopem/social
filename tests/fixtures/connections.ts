import type { ConnectionProvider } from "@opencoredev/social-sdk/server"

import { connectedAccountRef } from "@opencoredev/social-sdk"
import { ConnectionManager } from "@opencoredev/social-sdk/server"
import { Effect } from "effect"
import {
  makeSdkStores,
  pendingCredentialKey,
} from "server/features/channels/sdk-stores"

import { CredentialCrypto } from "auth/services/crypto"
import { SocialDb } from "db/services/channels/social"
import { WorkspacesDb } from "db/services/workspaces"
import type { Platform } from "rpc/contracts/channels"

import { fixtureError } from "./auth"

export const fixtureRedirect = "https://fixtures.example.test/social/callback"

export function fixtureSdk<A>(call: () => Promise<A>) {
  return Effect.tryPromise({
    try: call,
    catch: (error) =>
      fixtureError(
        error instanceof Error ? error.message : "Fixture provider failed",
      ),
  })
}

export function fixtureConnections() {
  return Effect.gen(function* () {
    const workspacesDb = yield* WorkspacesDb
    const db = yield* SocialDb
    const cipher = yield* CredentialCrypto
    const stores = yield* makeSdkStores()

    function provider(
      platform: Platform,
      displayName: string,
    ): ConnectionProvider {
      return {
        start(input) {
          return stores.bridge(
            Effect.succeed({
              authorizationUrl: `https://fixtures.example.test/authorize?state=${encodeURIComponent(input.state)}`,
            }),
          )
        },
        complete(input) {
          return stores.bridge(
            Effect.gen(function* () {
              const accountId =
                platform === "facebook"
                  ? `fixture-facebook:${input.attempt.tenantId}`
                  : `fixture-${platform}`

              const ciphertext = yield* cipher.encrypt(
                JSON.stringify({ accessToken: "isolated-fixture-token" }),
              )

              yield* db.casCredential(
                pendingCredentialKey(input.attempt.id, accountId),
                undefined,
                ciphertext,
              )

              return [
                {
                  ref: connectedAccountRef({
                    backend: input.attempt.backend,
                    platform,
                    accountId,
                  }),
                  displayName,
                },
              ]
            }),
          )
        },
      }
    }

    const manager = new ConnectionManager({ store: stores.connections })

    function begin(
      userId: string,
      workspaceId: string,
      platform: Platform,
      scenario = "success",
      displayName = "Alex on X",
    ) {
      return workspacesDb
        .workspaceAccess({ userId, workspaceId, manage: true })
        .pipe(
          Effect.andThen(
            fixtureSdk(() =>
              manager.begin({
                backend: `fixture:${scenario}:${workspaceId}:${platform}`,
                tenantId: workspaceId,
                principalId: userId,
                platforms: [platform],
                capabilities: [
                  "posts.publish",
                  "posts.read",
                  "analytics.read",
                  "analytics.account.read",
                ],
                redirectUri: fixtureRedirect,
                allowedRedirectUris: [fixtureRedirect],
                provider: provider(platform, displayName),
              }),
            ),
          ),
        )
    }

    function discover(
      userId: string,
      workspaceId: string,
      id: string,
      state: string,
      displayName = "Alex on X",
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({
          userId,
          workspaceId,
          manage: true,
        })
        const row = yield* db.attempt(id)

        if (!row) return yield* Effect.fail(fixtureError("Connection missing"))

        return yield* fixtureSdk(() =>
          manager.discover({
            attemptId: id,
            tenantId: workspaceId,
            principalId: userId,
            callbackUrl: `${fixtureRedirect}?code=fixture-code&state=${encodeURIComponent(state)}`,
            returnedState: state,
            allowedRedirectUris: [fixtureRedirect],
            provider: provider(row.platform, displayName),
          }),
        )
      })
    }

    function select(
      userId: string,
      workspaceId: string,
      id: string,
      accountIds: readonly string[],
    ) {
      return workspacesDb
        .workspaceAccess({ userId, workspaceId, manage: true })
        .pipe(
          Effect.andThen(
            fixtureSdk(() =>
              manager.select({
                attemptId: id,
                tenantId: workspaceId,
                principalId: userId,
                selectedAccountIds: accountIds,
              }),
            ),
          ),
        )
    }

    return { begin, discover, select, stores }
  })
}
