import { Context, DateTime, Effect, Layer, Option } from "effect"
import { OperationGate } from "server/features/accounts/operation-gate"
import { SocialService } from "server/features/channels/service"
import { MediaService } from "server/features/media/service"

import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import type {
  Delivery,
  Post,
  PostListPageInput,
  PostSaveInput,
} from "rpc/contracts/posts"
import { ApiError } from "rpc/lib/errors"

export function publicationState(
  deliveries: readonly Delivery[],
): Post["state"] {
  if (deliveries.length === 0) return "pending"

  if (deliveries.every((delivery) => delivery.state === "published"))
    return "published"

  if (deliveries.every((delivery) => delivery.state === "cancelled"))
    return "cancelled"

  if (
    deliveries.some((delivery) =>
      ["accepted", "processing", "unknown", "scheduled"].includes(
        delivery.state,
      ),
    )
  )
    return "pending"

  return deliveries.some((delivery) => delivery.state === "published")
    ? "partial"
    : "failed"
}

function makePosts() {
  return Effect.gen(function* () {
    const workspacesDb = yield* WorkspacesDb
    const postsDb = yield* PostsDb
    const gate = yield* OperationGate
    const social = yield* SocialService
    const media = yield* MediaService

    function save({
      userId,
      workspaceId,
      content,
      scheduledAt,
      postId,
    }: typeof PostSaveInput.Type & { readonly userId: string }) {
      return gate
        .run(
          userId,
          workspaceId,
          Effect.gen(function* () {
            yield* workspacesDb.workspaceAccess({ userId, workspaceId })

            if (!content.text.trim() && content.mediaIds.length === 0) {
              return yield* Effect.fail(
                new ApiError({
                  code: "invalid-input",
                  message: "Add text or media before saving.",
                }),
              )
            }

            let schedule: string | null = null

            if (scheduledAt !== null) {
              const parsed = DateTime.make(scheduledAt)
              const now = yield* DateTime.now

              if (
                Option.isNone(parsed) ||
                DateTime.toEpochMillis(parsed.value) <=
                  DateTime.toEpochMillis(now)
              ) {
                return yield* Effect.fail(
                  new ApiError({
                    code: "invalid-input",
                    message: "Choose a future publication time.",
                  }),
                )
              }

              if (content.channelIds.length === 0) {
                return yield* Effect.fail(
                  new ApiError({
                    code: "invalid-input",
                    message: "Select a channel before scheduling.",
                  }),
                )
              }

              schedule = DateTime.formatIso(parsed.value)
            }

            return yield* postsDb.savePost({
              workspaceId,
              content,
              scheduledAt: schedule,
              postId,
            })
          }),
        )
        .pipe(Effect.withSpan("PostService.save"))
    }

    function persist(
      workspaceId: string,
      postId: string,
      deliveries: readonly Delivery[],
    ) {
      return Effect.gen(function* () {
        const review = deliveries.some(
          (delivery) => delivery.state === "unknown",
        )
          ? "Publication is uncertain. Check the platform before retrying."
          : null

        yield* postsDb.setPostState({
          workspaceId,
          postId,
          state: publicationState(deliveries),
          reviewReason: review,
        })

        return yield* postsDb.getPost({ workspaceId, postId })
      })
    }

    function publish(
      userId: string,
      workspaceId: string,
      postId: string,
      operationKey: string,
    ) {
      return Effect.gen(function* () {
        yield* workspacesDb.workspaceAccess({ userId, workspaceId })

        const operation = yield* postsDb.publicationOperation({
          workspaceId,
          postId,
        })

        if (
          operation.operation_key !== null &&
          operation.operation_key !== operationKey
        )
          return yield* Effect.fail(
            new ApiError({
              code: "conflict",
              message: "Post belongs to another publication operation.",
            }),
          )

        if (
          operation.operation_key === operationKey &&
          (operation.dispatch_status === "dispatching" ||
            ["published", "partial", "failed", "cancelled"].includes(
              operation.state,
            ))
        )
          return yield* postsDb.getPost({ workspaceId, postId })
        const post = yield* postsDb.getPost({ workspaceId, postId })

        if (post.content.channelIds.length === 0) {
          return yield* Effect.fail(
            new ApiError({
              code: "invalid-input",
              message: "Select a channel before publishing.",
            }),
          )
        }

        const files = yield* media.publicMedia(
          userId,
          workspaceId,
          post.content.mediaIds,
        )

        yield* social.prepare(userId, workspaceId, post, files)

        const claimed = yield* postsDb.claimPost({
          workspaceId,
          postId,
          operationKey,
          expectedPost: post,
        })

        if (!claimed) return yield* postsDb.getPost({ workspaceId, postId })

        return yield* social
          .publish(userId, workspaceId, post, files, operationKey)
          .pipe(
            Effect.flatMap((deliveries) =>
              persist(workspaceId, postId, deliveries),
            ),
            Effect.catch((error) =>
              postsDb
                .setPostState({
                  workspaceId,
                  postId,
                  state: "pending",
                  reviewReason:
                    "Publication needs reconciliation. Do not publish again without checking the platform.",
                })
                .pipe(
                  Effect.catch(() =>
                    Effect.logError(
                      "Uncertain publication state could not be saved.",
                    ),
                  ),
                  Effect.andThen(Effect.fail(error)),
                ),
            ),
          )
      })
    }

    function publishJob(
      workspaceId: string,
      postId: string,
      operationKey: string,
    ) {
      return Effect.gen(function* () {
        const owner = yield* workspacesDb.automationPrincipal(workspaceId)

        return yield* publish(owner.id, workspaceId, postId, operationKey).pipe(
          Effect.catch((error) => {
            if (
              ["invalid-input", "not-configured", "forbidden"].includes(
                error.code,
              )
            ) {
              return postsDb
                .holdPost({ workspaceId, postId, reason: error.message })
                .pipe(Effect.andThen(postsDb.getPost({ workspaceId, postId })))
            }

            return Effect.fail(error)
          }),
        )
      })
    }

    function reconcile(workspaceId: string, postId: string) {
      return Effect.gen(function* () {
        const owner = yield* workspacesDb.automationPrincipal(workspaceId)
        const post = yield* postsDb.getPost({ workspaceId, postId })

        if (post.state !== "pending") return post
        const deliveries = yield* social.reconcile(owner.id, workspaceId, post)

        return yield* persist(workspaceId, postId, deliveries)
      })
    }

    function cancel(userId: string, workspaceId: string, postId: string) {
      return workspacesDb
        .workspaceAccess({ userId, workspaceId })
        .pipe(Effect.andThen(postsDb.cancelPost({ workspaceId, postId })))
    }

    function remove(userId: string, workspaceId: string, postId: string) {
      return workspacesDb
        .workspaceAccess({ userId, workspaceId })
        .pipe(Effect.andThen(postsDb.deletePost({ workspaceId, postId })))
    }

    function list(
      userId: string,
      workspaceId: string,
      filter: "all" | "draft" | "queue" | "sent",
    ) {
      return workspacesDb
        .workspaceAccess({ userId, workspaceId })
        .pipe(Effect.andThen(postsDb.listPosts({ workspaceId, filter })))
    }

    return {
      save,
      publish: gate.wrap(publish),
      publishJob,
      reconcile,
      cancel: gate.wrap(cancel),
      remove: gate.wrap(remove),
      list,
      listPage: Effect.fn("PostService.listPage")(function* (
        userId: string,
        input: typeof PostListPageInput.Type,
      ) {
        yield* workspacesDb.workspaceAccess({
          userId,
          workspaceId: input.workspaceId,
        })

        return yield* postsDb.listPostsPage(input)
      }),
    }
  })
}

export class PostService extends Context.Service<
  PostService,
  Effect.Success<ReturnType<typeof makePosts>>
>()("social/PostService") {}

export const postLayer = Layer.effect(PostService, makePosts())
