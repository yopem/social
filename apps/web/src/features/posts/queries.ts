import {
  infiniteQueryOptions,
  mutationOptions,
  queryOptions,
  skipToken,
  type QueryClient,
} from "@tanstack/react-query"
import { Effect, Match, Schema } from "effect"

import { callRpc } from "rpc/client"
import type { Channel } from "rpc/contracts/channels"
import type { Media } from "rpc/contracts/media"
import type {
  Post,
  PostContent,
  PostCursor,
  PostListPageInput,
} from "rpc/contracts/posts"
import type { Workspace } from "rpc/contracts/workspaces"
import { ApiError } from "rpc/lib/errors"

import type { dateBounds } from "@/features/posts/calendar"

import { validatePublishing } from "@/features/posts/publishing"
import { scheduleTime } from "@/features/posts/schema"
import {
  effectMutation,
  execute,
  rpcMutation,
  workspaceQuery,
} from "@/lib/queries"

export interface PostBrowseCriteria {
  date: string
  month: string
  channelId: string
  timezone: string
  bounds: ReturnType<typeof dateBounds> | undefined
}

export function postsQuery({
  workspaceId,
  filter,
  criteria,
}: {
  workspaceId: string
  filter: (typeof PostListPageInput.Type)["filter"]
  criteria: PostBrowseCriteria
}) {
  return infiniteQueryOptions({
    queryKey: [
      "workspace",
      workspaceId,
      "posts",
      filter,
      criteria.channelId,
      criteria.date,
      criteria.month,
      criteria.timezone,
    ],
    initialPageParam: null,
    queryFn: ({
      signal,
      pageParam,
    }: {
      signal: AbortSignal
      pageParam: typeof PostCursor.Type | null
    }) =>
      execute(
        callRpc((rpc) =>
          rpc.PostListPage({
            workspaceId,
            filter,
            channelId: criteria.channelId || undefined,
            ...criteria.bounds,
            cursor: pageParam ?? undefined,
          }),
        ),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: criteria.bounds !== null,
    retry: false,
  })
}

export function cancelPostMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(client, workspaceId, (rpc, postId: string) =>
    rpc.PostCancel({ workspaceId, postId }),
  )
}

export function deletePostMutation({
  client,
  workspaceId,
}: {
  client: QueryClient
  workspaceId: string
}) {
  return rpcMutation(client, workspaceId, (rpc, postId: string) =>
    rpc.PostDelete({ workspaceId, postId }),
  )
}

export type ComposerAction = "draft" | "publish" | "schedule"

export interface ComposerOperation {
  postId?: string
  key?: string
  publishStarted: boolean
  uncertainSave: boolean
}

const NewPostSaveState = Schema.Literals(["ready", "saving", "uncertain"])

export function newPostSaveStateQuery(workspaceId: string) {
  return queryOptions<typeof NewPostSaveState.Type>({
    queryKey: ["workspace", workspaceId, "new-post-save-state"],
    queryFn: skipToken,
    initialData: "ready",
    // Keep an unknown save state until page reload, without retaining post data.
    gcTime: Infinity,
  })
}

export function savePostMutation({
  client,
  workspace,
  channels,
  media,
  scheduled,
  onClose,
  onPublishStarted,
}: {
  client: QueryClient
  workspace: Workspace
  channels: readonly Channel[]
  media: readonly Media[]
  scheduled: string
  onClose: (result?: Post | null) => void
  onPublishStarted: () => void
}) {
  const workspaceId = workspace.id
  const saveStateKey = newPostSaveStateQuery(workspaceId).queryKey

  return mutationOptions({
    mutationKey: ["workspace", workspaceId, "post-save"],
    ...effectMutation(
      ({
        content,
        action,
        current,
      }: {
        content: PostContent
        action: ComposerAction
        current: ComposerOperation
      }) =>
        Effect.gen(function* () {
          const newSave = !current.postId

          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const state = client.getQueryData(saveStateKey)

              if (current.uncertainSave || (newSave && state === "uncertain"))
                return new ApiError({
                  code: "conflict",
                  message:
                    "Save outcome is unknown. Reload and review your posts before creating another post.",
                })

              if (!newSave) return null

              if (state === "saving")
                return new ApiError({
                  code: "conflict",
                  message: "Wait for the current post save to finish.",
                })

              client.setQueryData(saveStateKey, "saving")

              return null
            }).pipe(
              Effect.flatMap((error) =>
                error ? Effect.fail(error) : Effect.void,
              ),
            ),
            () =>
              Effect.sync(() => {
                if (newSave && client.getQueryData(saveStateKey) === "saving")
                  client.setQueryData(saveStateKey, "ready")
              }),
          )

          if (action !== "draft" && !current.publishStarted)
            yield* validatePublishing(content, channels, media)

          const scheduledAt =
            action === "schedule"
              ? yield* scheduleTime(scheduled, workspace.timezone)
              : null

          const saved =
            current.publishStarted && current.postId
              ? null
              : yield* callRpc((rpc) =>
                  rpc.PostSave({
                    workspaceId,
                    postId: current.postId,
                    content,
                    scheduledAt,
                  }),
                ).pipe(
                  Effect.tapError((error) =>
                    Effect.sync(() => {
                      // A new draft can commit before its response or row read fails.
                      const uncertain =
                        !(error instanceof ApiError) ||
                        Match.value(error.code).pipe(
                          Match.whenOr(
                            "storage-failure",
                            "upstream-failure",
                            "not-found",
                            () => true,
                          ),
                          Match.whenOr(
                            "unauthenticated",
                            "forbidden",
                            "invalid-input",
                            "not-configured",
                            "conflict",
                            () => false,
                          ),
                          Match.exhaustive,
                        )

                      if (uncertain && !current.postId) {
                        current.uncertainSave = true
                        client.setQueryData(saveStateKey, "uncertain")
                      }
                    }),
                  ),
                )

          if (saved) current.postId = saved.id

          if (action !== "publish") return saved

          const postId = current.postId

          if (!postId)
            return yield* Effect.fail(
              new ApiError({
                code: "conflict",
                message: "Save the post before publishing.",
              }),
            )

          // Keep this key when the publish result is not known.
          current.key ??= crypto.randomUUID()
          current.publishStarted = true
          onPublishStarted()

          return yield* callRpc((rpc) =>
            rpc.PostPublish({
              workspaceId,
              postId,
              idempotencyKey: current.key ?? "",
            }),
          )
        }).pipe(Effect.scoped),
    ),
    retry: false,
    onSuccess: (result: Post | null) =>
      execute(
        Effect.gen(function* () {
          yield* Effect.promise(() =>
            client.invalidateQueries({
              queryKey: ["workspace", workspaceId],
            }),
          )
          onClose(result)
        }),
      ),
  })
}

export function creatorQuery(channel: Channel) {
  return workspaceQuery(
    channel.workspaceId,
    "creator",
    (client) =>
      Effect.gen(function* () {
        const data = yield* client.TikTokCreatorInfo({
          workspaceId: channel.workspaceId,
          channelId: channel.id,
        })

        const creator = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            accountId: Schema.String,
            backend: Schema.String,
            fetchedAt: Schema.String,
            username: Schema.String,
            nickname: Schema.String,
            privacyLevels: Schema.Array(Schema.String),
            commentDisabled: Schema.Boolean,
            duetDisabled: Schema.Boolean,
            stitchDisabled: Schema.Boolean,
            maxVideoDurationSeconds: Schema.Number,
          }),
        )(data)

        return { creator, data }
      }),
    channel.id,
  )
}
