import { useForm, useStore, type StandardSchemaV1 } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DateTime, Effect, HashSet, Option, Schema } from "effect"
import { useRef, useState } from "react"

import type { Post, PostContent, PlatformOverride } from "rpc/contracts/posts"
import type { Workspace } from "rpc/contracts/workspaces"
import type { JsonObject } from "rpc/lib/json"

import { channelsQuery } from "@/features/channels/queries"
import { useComposerMedia } from "@/features/posts/hooks/use-composer-media"
import {
  newPostSaveStateQuery,
  savePostMutation,
  type ComposerAction,
  type ComposerOperation,
} from "@/features/posts/queries"
import { ComposerForm } from "@/features/posts/schema"
import { execute } from "@/lib/queries"

export interface ComposerProps {
  workspace: Workspace
  post?: Post
  onClose: (result?: Post | null) => void
}

export type ComposerController = ReturnType<typeof useComposer>

function composerDefaults(post?: Post) {
  const initial: Omit<PostContent, "overrides"> & {
    overrides: readonly Omit<PlatformOverride, "creatorInfo">[]
  } = {
    text: post?.content.text ?? "",
    mediaIds: post?.content.mediaIds ?? [],
    channelIds: post?.content.channelIds ?? [],
    overrides:
      post?.content.overrides.map(
        ({ creatorInfo: _creatorInfo, ...override }) => ({
          ...override,
          creatorConsent: false,
        }),
      ) ?? [],
  }

  return initial
}

function initialSchedule(post: Post | undefined, timezone: string) {
  if (!post?.scheduledAt) return ""
  const value = DateTime.makeZoned(post.scheduledAt, { timeZone: timezone })

  return Option.isSome(value)
    ? DateTime.formatIsoOffset(value.value).slice(0, 16)
    : ""
}

export function useComposer({ workspace, post, onClose }: ComposerProps) {
  const workspaceId = workspace.id
  const client = useQueryClient()

  const channels = useQuery(channelsQuery(workspaceId))

  const attachments = useComposerMedia(workspaceId, post)

  const [scheduled, setScheduled] = useState(() =>
    initialSchedule(post, workspace.timezone),
  )

  const action = useRef<ComposerAction>("draft")

  const saveState = useQuery(newPostSaveStateQuery(workspaceId))
  const uncertainSave = !post && saveState.data === "uncertain"

  const operation = useRef<ComposerOperation>({
    postId: post?.id,
    publishStarted: false,
    uncertainSave,
  })

  const [publishStarted, setPublishStarted] = useState(false)

  const mutation = useMutation(
    savePostMutation({
      client,
      workspace,
      channels: channels.data?.channels ?? [],
      media: attachments.media,
      scheduled,
      onClose,
      onPublishStarted: () => setPublishStarted(true),
    }),
  )

  const saving = mutation.isPending || (!post && saveState.data === "saving")

  const [creatorSnapshots, setCreatorSnapshots] = useState<
    Record<string, JsonObject>
  >({})

  const initial = composerDefaults(post)

  const validator: StandardSchemaV1<typeof initial> =
    Schema.toStandardSchemaV1(ComposerForm)

  const form = useForm({
    defaultValues: initial,
    validators: { onBlur: validator, onSubmit: validator },
    onSubmit: ({ value }) =>
      mutation.mutate({
        content: {
          ...value,
          overrides: value.overrides.map((override) => ({
            ...override,
            creatorInfo: creatorSnapshots[override.channelId],
          })),
        },
        action: action.current,
        current: operation.current,
      }),
  })

  const selectedTargetIds = HashSet.fromIterable(
    useStore(form.store, (state) => state.values.channelIds),
  )

  function resetConsent() {
    form.setFieldValue("overrides", (overrides) =>
      overrides.map((override) => ({ ...override, creatorConsent: false })),
    )
  }

  function removeMedia(id: string) {
    attachments.removeMedia(id)
    form.setFieldValue("mediaIds", (ids) => ids.filter((item) => item !== id))
    form.setFieldValue("overrides", (overrides) =>
      overrides.map((override) => ({
        ...override,
        photoCoverIndex: undefined,
        creatorConsent: false,
      })),
    )
  }

  function uploadFile(file: File) {
    attachments.uploadFile(file, (uploaded) => {
      form.setFieldValue("mediaIds", (ids) => [...ids, uploaded.id])
      resetConsent()
    })
  }

  function rememberCreator(channelId: string, creatorInfo: JsonObject) {
    setCreatorSnapshots((snapshots) => ({
      ...snapshots,
      [channelId]: creatorInfo,
    }))
  }

  function selectAction(value: ComposerAction) {
    action.current = value
  }

  function changeOpen(open: boolean) {
    if (!open && !saving && !attachments.uploading) onClose()
  }

  function submit() {
    // Clear stale schema paths before TanStack checks field validity.
    return execute(
      Effect.promise(() => Promise.resolve(form.validate("submit"))).pipe(
        Effect.andThen(() => Effect.promise(() => form.handleSubmit())),
      ),
    )
  }

  function retryChannels() {
    void channels.refetch()
  }

  return {
    form,
    attachments,
    channels: channels.data?.channels,
    channelsError: channels.error,
    channelsFailed: channels.isError,
    refreshingChannels: channels.isFetching,
    selectedTargetIds,
    saving,
    mutationError: mutation.error,
    publishStarted,
    uncertainSave,
    locked: saving || publishStarted || uncertainSave,
    scheduled,
    setScheduled,
    resetConsent,
    removeMedia,
    uploadFile,
    rememberCreator,
    selectAction,
    changeOpen,
    submit,
    retryChannels,
  }
}
