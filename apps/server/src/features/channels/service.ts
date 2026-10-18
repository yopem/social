import type {
  createSocial,
  DeliveryOutcome,
  MediaAttachment,
} from "@opencoredev/social-sdk"

import { Context, Effect, Layer, Match } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"
import { makeChannelAnalytics } from "server/features/channels/analytics"
import { platformAvailability } from "server/features/channels/configuration"
import { makeConnectionOperations } from "server/features/channels/connections"
import { preparePublicationTargets } from "server/features/channels/publication-targets"
import { makeSocialClient } from "server/features/channels/sdk-client"
import { sdkError, sdkRequest } from "server/features/channels/sdk-request"

import { ChannelsDb } from "db/services/channels"
import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import type { Channel } from "rpc/contracts/channels"
import type { Media } from "rpc/contracts/media"
import type { Delivery, Post } from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"

export function reconcileOutcomes(
  userId: string,
  workspaceId: string,
  post: Post,
  channels: readonly Channel[],
  client: Pick<ReturnType<typeof createSocial>, "posts">,
) {
  return Effect.gen(function* () {
    const outcomes: DeliveryOutcome[] = []

    for (const delivery of post.deliveries) {
      if (
        !delivery.providerPostId ||
        !["unknown", "processing", "accepted", "scheduled"].includes(
          delivery.state,
        )
      )
        continue
      const channel = channels.find((item) => item.id === delivery.channelId)

      if (!channel)
        return yield* Effect.fail(
          new ApiError({
            code: "storage-failure",
            message: "Delivery channel unavailable",
          }),
        )
      outcomes.push(
        yield* sdkRequest((signal) =>
          client.posts.getDelivery(
            {
              kind: "delivery",
              version: 1,
              backend: channel.backend,
              platform: channel.platform,
              accountId: channel.accountId,
              deliveryId: delivery.providerPostId ?? "",
            },
            {
              signal,
              authorization: { principalId: userId, tenantId: workspaceId },
            },
          ),
        ),
      )
    }

    return outcomes
  })
}

function makeSocial(config: AppConfig) {
  return Effect.gen(function* () {
    const channelsDb = yield* ChannelsDb
    const workspacesDb = yield* WorkspacesDb
    const postsDb = yield* PostsDb
    const gate = yield* OperationGate

    const { provider, requirePlatform, clientFor, tiktokCreatorInfo } =
      yield* makeSocialClient(config)

    function saveOutcomes(
      post: Post,
      channels: readonly Channel[],
      outcomes: readonly DeliveryOutcome[],
    ) {
      return Effect.forEach(
        outcomes,
        (outcome) => {
          const channel = channels.find(
            (item) =>
              item.backend === outcome.account.backend &&
              item.accountId === outcome.account.accountId &&
              item.platform === outcome.account.platform,
          )

          if (!channel)
            return Effect.fail(
              new ApiError({
                code: "upstream-failure",
                message: "Provider returned an unknown destination",
              }),
            )

          const delivery: Delivery = {
            id: `${post.id}:${channel.id}`,
            postId: post.id,
            channelId: channel.id,
            platform: channel.platform,
            state: outcome.state,
            message: Match.value(outcome).pipe(
              Match.when({ state: "failed" }, (value) => value.message),
              Match.when(
                { state: "unknown" },
                () => "Submission uncertain; reconcile before retry",
              ),
              Match.when({ state: "not-submitted" }, (value) => value.reason),
              Match.orElse(() => null),
            ),
            url: outcome.state === "published" ? (outcome.url ?? null) : null,
            providerPostId:
              outcome.state === "published"
                ? outcome.post.postId
                : (outcome.delivery?.deliveryId ?? null),
            observedAt: outcome.observedAt,
            retryDisposition: Match.value(outcome).pipe(
              Match.when(
                { state: "failed" },
                (value) => value.retryDisposition.kind,
              ),
              Match.when(
                { state: "unknown" },
                () => "reconcile-first" as const,
              ),
              Match.orElse(() => null),
            ),
          }

          return postsDb.saveDelivery(delivery).pipe(Effect.as(delivery))
        },
        { concurrency: 1 },
      )
    }

    function preparePost(
      userId: string,
      workspaceId: string,
      post: Post,
      media: readonly Media[],
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })

        if (
          post.workspaceId !== workspaceId ||
          !post.content.channelIds.length ||
          new Set(post.content.channelIds).size !==
            post.content.channelIds.length ||
          media.some((item) => item.workspaceId !== workspaceId) ||
          post.content.mediaIds.some(
            (id) => !media.some((item) => item.id === id),
          )
        )
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: "Post destinations or media are invalid",
            }),
          )

        if (
          new Set(post.content.overrides.map((override) => override.channelId))
            .size !== post.content.overrides.length ||
          post.content.overrides.some(
            (override) => !post.content.channelIds.includes(override.channelId),
          )
        )
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message:
                "Platform overrides must identify one selected destination each",
            }),
          )

        const attachments: MediaAttachment[] = media.flatMap(
          (item): MediaAttachment[] =>
            post.content.mediaIds.includes(item.id)
              ? [
                  {
                    kind: item.kind,
                    source: { kind: "https-url", url: item.url },
                    mimeType: item.mediaType,
                    filename: item.name,
                    byteSize: item.bytes,
                  },
                ]
              : [],
        )

        for (const item of attachments) {
          if (item.source.kind !== "https-url") continue
          const source = item.source

          const url = yield* Effect.try({
            try: () => new URL(source.url),
            catch: sdkError,
          })

          if (url.protocol !== "https:" || url.origin !== config.APP_ORIGIN)
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "Media must use the application's secure origin",
              }),
            )
        }

        const channels = yield* Effect.forEach(
          post.content.channelIds,
          (id) => channelsDb.channel({ workspaceId, channelId: id }),
          { concurrency: 1 },
        )

        const targets = yield* preparePublicationTargets({
          config,
          post,
          channels,
          attachments,
        })

        const { client, stores } = yield* clientFor({
          userId,
          workspaceId,
          channels,
        })

        const request = {
          targets,
          content: { text: post.content.text, media: attachments },
        }

        const plan = yield* Effect.try({
          try: () => client.posts.prepare(request),
          catch: sdkError,
        })

        if (!plan.ok)
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: plan.issues.map((issue) => issue.message).join("; "),
            }),
          )

        for (const [index, target] of targets.entries()) {
          if (target.account.platform !== "tiktok") continue

          const channel = channels.find(
            (item) =>
              item.backend === target.account.backend &&
              item.accountId === target.account.accountId,
          )

          if (!channel)
            return yield* Effect.fail(
              new ApiError({
                code: "invalid-input",
                message: "TikTok destination is unavailable",
              }),
            )

          const creatorInfo = yield* tiktokCreatorInfo(
            userId,
            workspaceId,
            channel.id,
          )

          targets[index] = {
            ...target,
            options: { ...target.options, creatorInfo },
          }
        }

        const currentPlan = yield* Effect.try({
          try: () => client.posts.prepare(request),
          catch: sdkError,
        })

        if (!currentPlan.ok)
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: currentPlan.issues
                .map((issue) => issue.message)
                .join("; "),
            }),
          )

        return { client, stores, channels, request }
      })
    }

    const connections = yield* makeConnectionOperations({
      config,
      provider,
      requirePlatform,
    })

    const analytics = yield* makeChannelAnalytics(
      ({ userId, workspaceId, channel }) =>
        clientFor({
          userId,
          workspaceId,
          channels: [channel],
          operation: "analytics.account.read",
        }),
    )

    const operations = {
      ...connections,
      tiktokCreatorInfo,
      availability(this: void) {
        return Effect.succeed(platformAvailability(config))
      },
      prepare(
        this: void,
        userId: string,
        workspaceId: string,
        post: Post,
        media: readonly Media[],
      ) {
        return preparePost(userId, workspaceId, post, media).pipe(Effect.asVoid)
      },
      publish(
        this: void,
        userId: string,
        workspaceId: string,
        post: Post,
        media: readonly Media[],
        idempotencyKey: string,
      ) {
        return Effect.gen(function* () {
          const prepared = yield* preparePost(userId, workspaceId, post, media)
          const { client, stores, channels } = prepared

          const request = {
            ...prepared.request,
            idempotencyKey: `${post.id}:${idempotencyKey}`,
          }

          const result = yield* sdkRequest((signal) =>
            client.posts.publish(request, {
              signal,
              authorization: { principalId: userId, tenantId: workspaceId },
              retryBudget: { maxAttempts: 1, maxElapsedMs: 60000 },
            }),
          )

          const deliveries = yield* saveOutcomes(
            post,
            channels,
            result.outcomes,
          )

          if (stores.persistenceFailure())
            return yield* Effect.fail(
              new ApiError({
                code: "storage-failure",
                message:
                  "Delivery log write failed; reconciliation required before retry",
              }),
            )

          return deliveries
        })
      },
      analytics,
      reconcile(this: void, userId: string, workspaceId: string, post: Post) {
        return Effect.gen(function* () {
          yield* workspacesDb.workspaceAccess({ userId, workspaceId })

          if (post.workspaceId !== workspaceId)
            return yield* Effect.fail(
              new ApiError({
                code: "forbidden",
                message: "Post belongs to another workspace",
              }),
            )

          const channels = yield* Effect.forEach(
            post.content.channelIds,
            (id) => channelsDb.channel({ workspaceId, channelId: id }),
            { concurrency: 1 },
          )

          const { client } = yield* clientFor({
            userId,
            workspaceId,
            channels,
            operation: "posts.read",
          })

          const outcomes = yield* reconcileOutcomes(
            userId,
            workspaceId,
            post,
            channels,
            client,
          )

          const updated = yield* saveOutcomes(post, channels, outcomes)

          return post.deliveries.map(
            (delivery) =>
              updated.find((item) => item.channelId === delivery.channelId) ??
              delivery,
          )
        })
      },
    }

    return {
      ...operations,
      tiktokCreatorInfo: gate.wrap(operations.tiktokCreatorInfo),
      begin: gate.wrap(operations.begin),
      discover: gate.wrap(operations.discover),
      discovered: gate.wrap(operations.discovered),
      select: gate.wrap(operations.select),
      disconnect: gate.wrap(operations.disconnect),
      prepare: gate.wrap(operations.prepare),
      publish: gate.wrap(operations.publish),
      analytics: gate.wrap(operations.analytics),
      reconcile: gate.wrap(operations.reconcile),
    }
  })
}

export class SocialService extends Context.Service<
  SocialService,
  Effect.Success<ReturnType<typeof makeSocial>>
>()("social/SocialService") {}

export function socialLayer(config: AppConfig) {
  return Layer.effect(SocialService, makeSocial(config))
}
