import type { createSocial } from "@opencoredev/social-sdk"

import { connectedAccountRef, platformPostRef } from "@opencoredev/social-sdk"
import { Effect, Result, Schema } from "effect"
import { sdkError, sdkRequest } from "server/features/channels/sdk-request"

import { ChannelsDb } from "db/services/channels"
import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import { Analytics } from "rpc/contracts/analytics"
import type { Channel } from "rpc/contracts/channels"
import type { ApiError } from "rpc/lib/errors"

export function makeChannelAnalytics<R>(
  clientFor: (input: {
    userId: string
    workspaceId: string
    channel: Channel
  }) => Effect.Effect<
    { readonly client: Pick<ReturnType<typeof createSocial>, "analytics"> },
    ApiError,
    R
  >,
) {
  return Effect.gen(function* () {
    const workspacesDb = yield* WorkspacesDb
    const channelsDb = yield* ChannelsDb
    const postsDb = yield* PostsDb

    function analytics(this: void, userId: string, workspaceId: string) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })
        const channels = yield* channelsDb.listChannels(workspaceId)

        const posts = yield* postsDb.listPosts({
          workspaceId,
          filter: "sent",
        })

        const results = yield* Effect.forEach(
          channels,
          (channel) =>
            Effect.gen(function* () {
              const ready = yield* clientFor({
                userId,
                workspaceId,
                channel,
              }).pipe(Effect.result)

              const accountMetrics = yield* (
                Result.isSuccess(ready)
                  ? sdkRequest((signal) =>
                      ready.success.client.analytics.getAccountMetrics(
                        connectedAccountRef({
                          backend: channel.backend,
                          platform: channel.platform,
                          accountId: channel.accountId,
                        }),
                        {
                          signal,
                          authorization: {
                            principalId: userId,
                            tenantId: workspaceId,
                          },
                        },
                      ),
                    )
                  : Effect.fail(ready.failure)
              ).pipe(Effect.result)

              const available =
                Result.isSuccess(accountMetrics) &&
                accountMetrics.success.length > 0

              const account = {
                channelId: channel.id,
                platform: channel.platform,
                available,
                reason: available
                  ? null
                  : "Account analytics unavailable: permission, configuration, or adapter support missing",
                metrics: Result.isSuccess(accountMetrics)
                  ? accountMetrics.success.map((metric) => ({
                      name: metric.name,
                      value: metric.value,
                      unit: metric.unit,
                    }))
                  : [],
              }

              const postMetrics = yield* Effect.forEach(
                posts.flatMap((post) =>
                  post.deliveries.flatMap((delivery) =>
                    delivery.channelId === channel.id &&
                    delivery.state === "published" &&
                    delivery.providerPostId
                      ? [{ post, delivery }]
                      : [],
                  ),
                ),
                ({ post, delivery }) =>
                  Effect.gen(function* () {
                    const result = yield* (
                      Result.isSuccess(ready)
                        ? sdkRequest((signal) =>
                            ready.success.client.analytics.getPostMetrics(
                              platformPostRef({
                                backend: channel.backend,
                                platform: channel.platform,
                                accountId: channel.accountId,
                                postId: delivery.providerPostId ?? "",
                              }),
                              {
                                signal,
                                authorization: {
                                  principalId: userId,
                                  tenantId: workspaceId,
                                },
                              },
                            ),
                          )
                        : Effect.fail(ready.failure)
                    ).pipe(Effect.result)

                    const available =
                      Result.isSuccess(result) && result.success.length > 0

                    return {
                      postId: post.id,
                      channelId: channel.id,
                      available,
                      reason: available
                        ? null
                        : "Post analytics unavailable: permission, configuration, or adapter support missing",
                      metrics: Result.isSuccess(result)
                        ? result.success.map((metric) => ({
                            name: metric.name,
                            value: metric.value,
                            unit: metric.unit,
                          }))
                        : [],
                    }
                  }),
                { concurrency: 1 },
              )

              return { account, posts: postMetrics }
            }),
          { concurrency: 2 },
        )

        return yield* Schema.decodeUnknownEffect(Analytics)({
          channels: results.map((result) => result.account),
          posts: results.flatMap((result) => result.posts),
        }).pipe(Effect.mapError(sdkError))
      })
    }

    return analytics
  })
}
