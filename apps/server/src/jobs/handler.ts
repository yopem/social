import { Context, Effect, Layer, Schema } from "effect"
import { FeedService } from "server/services/feeds"
import { PostService } from "server/services/posts"

import { CoreDb } from "db/services/core"
import type { ResourceBindings } from "env/server"
import { JobMessage, WorkerResources } from "env/server"
import { ApiError } from "rpc/contracts/models"

function makeJobs(bindings?: Pick<ResourceBindings, "JOBS">) {
  return Effect.gen(function* () {
    const db = yield* CoreDb
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
      return Schema.decodeUnknown(JobMessage)(message).pipe(
        Effect.mapError(
          () =>
            new ApiError({
              code: "invalid-input",
              message: "Queue message is invalid.",
            }),
        ),
        Effect.flatMap((job) => {
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
        Effect.catchIf(
          (error) => error.code === "not-found",
          () => Effect.void,
        ),
      )
    }

    return { enqueueDue, handle }
  })
}

export class JobService extends Context.Tag("social/JobService")<
  JobService,
  Effect.Effect.Success<ReturnType<typeof makeJobs>>
>() {}

export function jobLayer(bindings?: Pick<ResourceBindings, "JOBS">) {
  return Layer.effect(JobService, makeJobs(bindings))
}
