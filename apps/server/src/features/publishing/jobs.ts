import type { Message } from "@cloudflare/workers-types"

import { Context, Effect, Layer, Schema } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"
import { FeedService } from "server/features/feeds/service"
import { PostService } from "server/features/posts/service"

import { CoreDb } from "db/services/client"
import type { ResourceBindings } from "env/server"
import { JobMessage, WorkerResources } from "env/server"
import { ApiError } from "rpc/lib/errors"

function makeJobs(bindings?: Pick<ResourceBindings, "JOBS">) {
  return Effect.gen(function* () {
    const db = yield* CoreDb
    const gate = yield* OperationGate
    const feeds = yield* FeedService
    const posts = yield* PostService
    const resources = yield* WorkerResources
    const queue = bindings?.JOBS ?? resources.JOBS

    function send(message: JobMessage) {
      return Effect.tryPromise({
        try: () => queue.send(message),
        catch: () =>
          new ApiError({
            code: "upstream-failure",
            message: "Domain work could not be queued.",
          }),
      })
    }

    function enqueueDue() {
      return Effect.gen(function* () {
        const due = yield* db.claimDuePosts(20)
        yield* Effect.forEach(
          due,
          (post) =>
            Effect.gen(function* () {
              const operationKey = `scheduled:${post.id}`
              yield* send({
                type: "publish",
                workspaceId: post.workspaceId,
                postId: post.id,
                operationKey,
              })
              yield* db.markPostEnqueued(
                post.workspaceId,
                post.id,
                operationKey,
              )
            }),
          { concurrency: 4, discard: true },
        )
        const feedList = yield* db.listDueFeeds(10)
        yield* Effect.forEach(
          feedList,
          (feed) =>
            send({
              type: "feed",
              workspaceId: feed.workspaceId,
              feedId: feed.id,
            }),
          { concurrency: 4, discard: true },
        )
        const pending = yield* db.listPendingPosts(20)
        yield* Effect.forEach(
          pending,
          (post) =>
            send({
              type: "reconcile",
              workspaceId: post.workspaceId,
              postId: post.id,
            }),
          { concurrency: 4, discard: true },
        )
      })
    }

    function handle(message: JobMessage) {
      return Schema.decodeUnknownEffect(JobMessage)(message).pipe(
        Effect.mapError(
          () =>
            new ApiError({
              code: "invalid-input",
              message: "Queue message is invalid.",
            }),
        ),
        Effect.flatMap((job) =>
          Effect.flatMap(db.automationPrincipal(job.workspaceId), (owner) =>
            gate.run(
              owner.id,
              job.workspaceId,
              Effect.suspend(() => {
                switch (job.type) {
                  case "publish":
                    return posts
                      .publishJob(job.workspaceId, job.postId, job.operationKey)
                      .pipe(Effect.asVoid)
                  case "feed":
                    return feeds
                      .refreshJob(job.workspaceId, job.feedId, job.cursor)
                      .pipe(Effect.asVoid)
                  case "reconcile":
                    return posts
                      .reconcile(job.workspaceId, job.postId)
                      .pipe(Effect.asVoid)
                }
              }),
            ),
          ),
        ),
        Effect.catchIf(
          (error) => error.code === "not-found",
          () => Effect.void,
        ),
      )
    }

    return { enqueueDue, handle }
  })
}

export class JobService extends Context.Service<
  JobService,
  Effect.Success<ReturnType<typeof makeJobs>>
>()("social/JobService") {}

export function jobLayer(bindings?: Pick<ResourceBindings, "JOBS">) {
  return Layer.effect(JobService, makeJobs(bindings))
}

export function processQueue(messages: readonly Message<unknown>[]) {
  return Effect.gen(function* () {
    const jobs = yield* JobService
    yield* Effect.forEach(
      messages,
      (message) =>
        Schema.decodeUnknownEffect(JobMessage)(message.body).pipe(
          Effect.flatMap(jobs.handle),
          Effect.matchEffect({
            onSuccess: () => Effect.sync(() => message.ack()),
            onFailure: (error) =>
              Effect.logWarning("Queue work failed").pipe(
                Effect.annotateLogs(
                  "failure_code",
                  error instanceof ApiError ? error.code : "invalid-input",
                ),
                Effect.andThen(
                  Effect.sync(() =>
                    message.retry({
                      delaySeconds: Math.min(
                        300,
                        2 ** Math.min(message.attempts, 8),
                      ),
                    }),
                  ),
                ),
              ),
          }),
        ),
      { concurrency: 4, discard: true },
    )
  })
}
