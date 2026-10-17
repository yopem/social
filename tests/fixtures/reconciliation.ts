import { connectedAccountRef, platformPostRef } from "@opencoredev/social-sdk"
import { DateTime, Effect, Schema } from "effect"
import { OutcomeSchema } from "server/features/channels/sdk-stores"
import { processQueue, JobService } from "server/features/publishing/jobs"

import { SocialDb } from "db/services/channels/social"
import { CoreDb } from "db/services/client"
import { fixtureDatabaseStats } from "db/services/migrations"
import { WorkerResources } from "env/server"

import { fixtureError, fixtureJson } from "./auth"
import { fixtureConnections } from "./connections"

export function reconciliationFixture(
  request: Request,
  userId: string,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const input = yield* fixtureJson(
      request,
      Schema.Struct({
        mode: Schema.Literals(["setup", "fail", "restore"]),
        postId: Schema.optional(Schema.String),
      }),
    )

    const core = yield* CoreDb
    yield* core.workspaceAccess(userId, workspaceId)
    const social = yield* SocialDb
    let postId = input.postId

    if (input.mode === "setup") {
      const connections = yield* fixtureConnections()

      const started = yield* connections.begin(
        userId,
        workspaceId,
        "x",
        "unknown",
      )

      const accounts = yield* connections.discover(
        userId,
        workspaceId,
        started.attempt.id,
        started.attempt.state,
      )

      yield* connections.select(
        userId,
        workspaceId,
        started.attempt.id,
        accounts.map((account) => account.ref.accountId),
      )

      const channel = (yield* core.listChannels(workspaceId)).find(
        (channel) => channel.backend === started.attempt.backend,
      )

      if (!channel)
        return yield* fixtureError("Reconciliation fixture channel missing")

      const post = yield* core.savePost(
        workspaceId,
        {
          text: "Reconciliation outage fixture",
          channelIds: [channel.id],
          mediaIds: [],
          overrides: [],
        },
        null,
      )

      postId = post.id
      const jobs = yield* JobService
      yield* jobs.handle({
        type: "publish",
        workspaceId,
        postId,
        operationKey: `fixture:${postId}`,
      })
      yield* social.createWorkflow(
        `${workspaceId}:${postId}:${channel.id}:lookup`,
        "fixture-lookup",
        "outage",
        { tenantId: workspaceId, principalId: userId },
      )
    }

    if (!postId)
      return yield* fixtureError("Reconciliation fixture post missing")
    const post = yield* core.getPost(workspaceId, postId)
    const delivery = post.deliveries[0]

    if (!delivery)
      return yield* fixtureError("Reconciliation fixture delivery missing")
    const channel = yield* core.channel(workspaceId, delivery.channelId)
    const workflowId = `${workspaceId}:${postId}:${channel.id}`

    if ((yield* social.workflow(`${workflowId}:lookup`)) !== "outage")
      return yield* fixtureError(
        "Reconciliation fixture is not awaiting provider recovery",
      )

    if (input.mode === "restore") {
      const outcome = yield* Schema.decodeUnknownEffect(OutcomeSchema)({
        state: "published",
        targetIndex: 0,
        account: connectedAccountRef(channel),
        observedAt: DateTime.formatIso(yield* DateTime.now),
        delivery: {
          kind: "delivery",
          version: 1,
          backend: channel.backend,
          platform: channel.platform,
          accountId: channel.accountId,
          deliveryId: delivery.providerPostId,
        },
        post: platformPostRef({ ...channel, postId: `restored:${postId}` }),
      }).pipe(
        Effect.mapError(() =>
          fixtureError("Invalid restored provider outcome"),
        ),
      )

      yield* social.updateWorkflow(workflowId, JSON.stringify(outcome))
      yield* social.updateWorkflow(`${workflowId}:lookup`, "available")
    }

    let acknowledgements = 0
    let retries = 0

    if (input.mode !== "setup")
      yield* processQueue([
        {
          id: crypto.randomUUID(),
          timestamp: DateTime.toDate(yield* DateTime.now),
          attempts: input.mode === "fail" ? 1 : 2,
          body: { type: "reconcile", workspaceId, postId },
          ack() {
            acknowledgements += 1
          },
          retry() {
            retries += 1
          },
        },
      ])
    const resources = yield* WorkerResources
    const stats = yield* fixtureDatabaseStats(resources.DB, workspaceId)
    const saved = yield* core.getPost(workspaceId, postId)

    return Response.json({
      postId,
      dispatches: stats.dispatches,
      state: saved.state,
      deliveryState: saved.deliveries[0]?.state,
      acknowledgements,
      retries,
    })
  })
}
