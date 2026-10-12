import { Context, DateTime, Effect, Layer, Option } from "effect"
import { OperationGate } from "server/services/operation-gate"
import { SocialService } from "server/services/social"
import { MediaService } from "server/storage/media"

import { CoreDb } from "db/services/core"
import type { Delivery, Post, PostContent } from "rpc/contracts/models"
import { ApiError } from "rpc/contracts/models"

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
    const db = yield* CoreDb
    const gate = yield* OperationGate
    const social = yield* SocialService
    const media = yield* MediaService

    function save(
      userId: string,
      workspaceId: string,
      content: PostContent,
      scheduledAt: string | null,
      postId?: string,
    ) {
      return Effect.gen(function* () {
        yield* db.workspaceAccess(userId, workspaceId)

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
            DateTime.toEpochMillis(parsed.value) <= DateTime.toEpochMillis(now)
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

        return yield* db.savePost(workspaceId, content, schedule, postId)
      })
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

        yield* db.setPostState(
          workspaceId,
          postId,
          publicationState(deliveries),
          review,
        )

        return yield* db.getPost(workspaceId, postId)
      })
    }

    function publish(
      userId: string,
      workspaceId: string,
      postId: string,
      operationKey: string,
    ) {
      return Effect.gen(function* () {
        yield* db.workspaceAccess(userId, workspaceId)
        const post = yield* db.getPost(workspaceId, postId)

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
        const claimed = yield* db.claimPost(workspaceId, postId, operationKey)

        if (!claimed) return yield* db.getPost(workspaceId, postId)

        return yield* social
          .publish(userId, workspaceId, post, files, operationKey)
          .pipe(
            Effect.flatMap((deliveries) =>
              persist(workspaceId, postId, deliveries),
            ),
            Effect.catch((error) =>
              db
                .setPostState(
                  workspaceId,
                  postId,
                  "pending",
                  "Publication needs reconciliation. Do not publish again without checking the platform.",
                )
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
        const owner = yield* db.automationPrincipal(workspaceId)

        return yield* publish(owner.id, workspaceId, postId, operationKey).pipe(
          Effect.catch((error) => {
            if (
              ["invalid-input", "not-configured", "forbidden"].includes(
                error.code,
              )
            ) {
              return db
                .holdPost(workspaceId, postId, error.message)
                .pipe(Effect.andThen(db.getPost(workspaceId, postId)))
            }

            return Effect.fail(error)
          }),
        )
      })
    }

    function reconcile(workspaceId: string, postId: string) {
      return Effect.gen(function* () {
        const owner = yield* db.automationPrincipal(workspaceId)
        const post = yield* db.getPost(workspaceId, postId)

        if (post.state !== "pending") return post
        const deliveries = yield* social.reconcile(owner.id, workspaceId, post)

        return yield* persist(workspaceId, postId, deliveries)
      })
    }

    function cancel(userId: string, workspaceId: string, postId: string) {
      return db
        .workspaceAccess(userId, workspaceId)
        .pipe(Effect.andThen(db.cancelPost(workspaceId, postId)))
    }

    function remove(userId: string, workspaceId: string, postId: string) {
      return db
        .workspaceAccess(userId, workspaceId)
        .pipe(Effect.andThen(db.deletePost(workspaceId, postId)))
    }

    function list(
      userId: string,
      workspaceId: string,
      filter: "all" | "draft" | "queue" | "sent",
    ) {
      return db
        .workspaceAccess(userId, workspaceId)
        .pipe(Effect.andThen(db.listPosts(workspaceId, filter)))
    }

    return {
      save: gate.wrap(save),
      publish: gate.wrap(publish),
      publishJob,
      reconcile,
      cancel: gate.wrap(cancel),
      remove: gate.wrap(remove),
      list,
    }
  })
}

export class PostService extends Context.Service<
  PostService,
  Effect.Success<ReturnType<typeof makePosts>>
>()("social/PostService") {}

export const postLayer = Layer.effect(PostService, makePosts())
