import * as stylex from "@stylexjs/stylex"
import { useForm, useStore, type StandardSchemaV1 } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { DateTime, Effect, Option, Schema } from "effect"
import { useRef, useState } from "react"

import { withRpc } from "rpc/client"
import type { JsonObject } from "rpc/contracts/json"
import {
  ApiError,
  type Media,
  type Post,
  type PostContent,
  type PlatformOverride,
  type Workspace,
} from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "ui/components/ui/dialog"
import { Field, FieldError, FieldLabel } from "ui/components/ui/field"
import { Flex } from "ui/components/ui/flex"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"
import { Textarea } from "ui/components/ui/textarea"

import { Check, Failure, FormErrors, deskStyles } from "@/components/desk-ui"
import { validatePublishing } from "@/features/desk/publishing"
import {
  effectMutation,
  mediaMutation,
  workspaceQuery,
} from "@/features/desk/queries"
import { ComposerForm, scheduleTime } from "@/features/desk/schema"

import { TargetOptions } from "./target-options"

export function Composer({
  workspace,
  post,
  onClose,
}: {
  workspace: Workspace
  post?: Post
  onClose: (result?: Post | null) => void
}) {
  const workspaceId = workspace.id
  const client = useQueryClient()

  const channels = useQuery(
    workspaceQuery(workspaceId, "channels", (rpc) =>
      rpc.ChannelList({ workspaceId }),
    ),
  )

  const savedMedia = useQuery({
    ...workspaceQuery(
      workspaceId,
      "media",
      (rpc) =>
        rpc.MediaList({ workspaceId, mediaIds: post?.content.mediaIds ?? [] }),
      post?.content.mediaIds.join(",") ?? "",
    ),
    enabled: Boolean(post?.content.mediaIds.length),
  })

  const [uploadedMedia, setUploadedMedia] = useState<readonly Media[]>([])
  const [removedMediaIds, setRemovedMediaIds] = useState<readonly string[]>([])

  const removedMediaIdSet = new Set(removedMediaIds)

  const media = [...(savedMedia.data ?? []), ...uploadedMedia].filter(
    (item) => !removedMediaIdSet.has(item.id),
  )

  const [scheduled, setScheduled] = useState(() => {
    if (!post?.scheduledAt) return ""

    const value = DateTime.makeZoned(post.scheduledAt, {
      timeZone: workspace.timezone,
    })

    return Option.isSome(value)
      ? DateTime.formatIsoOffset(value.value).slice(0, 16)
      : ""
  })

  const actionRef = useRef<"draft" | "publish" | "schedule">("draft")

  const operation = useRef<{
    postId?: string
    key?: string
    publishStarted: boolean
    uncertainSave: boolean
  }>({
    postId: post?.id,
    publishStarted: false,
    uncertainSave: false,
  })

  const upload = useMutation(mediaMutation(workspaceId))
  const [publishStarted, setPublishStarted] = useState(false)
  const [uncertainSave, setUncertainSave] = useState(false)

  const mutation = useMutation({
    ...effectMutation(
      ({
        content,
        action,
        current,
      }: {
        content: PostContent
        action: "draft" | "publish" | "schedule"
        current: {
          postId?: string
          key?: string
          publishStarted: boolean
          uncertainSave: boolean
        }
      }) =>
        Effect.gen(function* () {
          if (current.uncertainSave)
            return yield* Effect.fail(
              new ApiError({
                code: "conflict",
                message:
                  "Save outcome is unknown. Reload and review the draft list before creating another post.",
              }),
            )

          if (action !== "draft" && !current.publishStarted)
            yield* validatePublishing(
              content,
              channels.data?.channels ?? [],
              media,
            )

          const scheduledAt =
            action === "schedule"
              ? yield* scheduleTime(scheduled, workspace.timezone)
              : null

          const saved =
            current.publishStarted && current.postId
              ? null
              : yield* withRpc((rpc) =>
                  rpc.PostSave({
                    workspaceId,
                    postId: current.postId,
                    content,
                    scheduledAt,
                  }),
                ).pipe(
                  Effect.tapError((error) =>
                    Effect.sync(() => {
                      if (!(error instanceof ApiError) && !current.postId) {
                        current.uncertainSave = true
                        setUncertainSave(true)
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
          current.key ??= crypto.randomUUID()
          current.publishStarted = true
          setPublishStarted(true)

          return yield* withRpc((rpc) =>
            rpc.PostPublish({
              workspaceId,
              postId,
              idempotencyKey: current.key ?? "",
            }),
          )
        }),
    ),
    retry: false,
    onSuccess: async (result) => {
      await client.invalidateQueries({ queryKey: ["workspace", workspaceId] })
      onClose(result)
    },
  })

  const [creatorSnapshots, setCreatorSnapshots] = useState<
    Record<string, JsonObject>
  >({})

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

  const validator: StandardSchemaV1<typeof initial> =
    Schema.toStandardSchemaV1(ComposerForm)

  const form = useForm({
    defaultValues: initial,
    validators: {
      onBlur: validator,
      onSubmit: validator,
    },
    onSubmit: ({ value }) =>
      mutation.mutate({
        content: {
          ...value,
          overrides: value.overrides.map((override) => ({
            ...override,
            creatorInfo: creatorSnapshots[override.channelId],
          })),
        },
        action: actionRef.current,
        current: operation.current,
      }),
  })

  const selectedTargetIds = new Set(
    useStore(form.store, (state) => state.values.channelIds),
  )

  function resetConsent() {
    form.setFieldValue("overrides", (overrides) =>
      overrides.map((override) => ({ ...override, creatorConsent: false })),
    )
  }

  const needsSavedMedia =
    post?.content.mediaIds.some((id) => !removedMediaIdSet.has(id)) === true

  const loadingMedia = needsSavedMedia && savedMedia.isPending

  const mediaUnavailable =
    needsSavedMedia && (savedMedia.isPending || savedMedia.isError)

  const locked = mutation.isPending || publishStarted || uncertainSave

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending && !upload.isPending) onClose()
      }}
    >
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>{post ? "Edit post" : "Create post"}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <form
            {...stylex.props(deskStyles.stack)}
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void form.handleSubmit()
            }}
          >
            <form.Field name="text">
              {(field) => (
                <Field
                  invalid={field.state.meta.errors.length > 0}
                  touched={field.state.meta.isTouched}
                >
                  <FieldLabel>Post text</FieldLabel>
                  <Textarea
                    rows={5}
                    value={field.state.value}
                    disabled={locked}
                    onBlur={field.handleBlur}
                    onChange={(event) => {
                      field.handleChange(event.target.value)
                      resetConsent()
                    }}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <FieldError match>
                      <FormErrors errors={field.state.meta.errors} />
                    </FieldError>
                  )}
                </Field>
              )}
            </form.Field>
            <label
              htmlFor="composer-field-1"
              {...stylex.props(deskStyles.label)}
            >
              Add images or video
              <Input
                id="composer-field-1"
                nativeInput
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                disabled={locked || upload.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.currentTarget.value = ""

                  if (file)
                    upload.mutate(file, {
                      onSuccess: (uploaded) => {
                        setUploadedMedia((items) => [...items, uploaded])
                        form.setFieldValue("mediaIds", (ids) => [
                          ...ids,
                          uploaded.id,
                        ])
                        resetConsent()
                      },
                    })
                }}
              />
            </label>
            <Failure error={upload.error} />
            {upload.isPending && (
              <Box render={<output />}>Uploading media…</Box>
            )}
            {media.map((item) => (
              <Flex key={item.id} spacing="normal" wrap align="center">
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.name}
                </a>
                <Button
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    setRemovedMediaIds((ids) => [...ids, item.id])
                    form.setFieldValue("mediaIds", (ids) =>
                      ids.filter((id) => id !== item.id),
                    )
                    form.setFieldValue("overrides", (overrides) =>
                      overrides.map((override) => ({
                        ...override,
                        photoCoverIndex: undefined,
                        creatorConsent: false,
                      })),
                    )
                  }}
                >
                  Remove {item.name}
                </Button>
              </Flex>
            ))}
            {savedMedia.isError &&
              post?.content.mediaIds
                .filter((id) => !removedMediaIdSet.has(id))
                .map((id) => (
                  <Button
                    key={id}
                    variant="outline"
                    disabled={locked}
                    onClick={() => {
                      setRemovedMediaIds((ids) => [...ids, id])
                      form.setFieldValue("mediaIds", (ids) =>
                        ids.filter((item) => item !== id),
                      )
                      form.setFieldValue("overrides", (overrides) =>
                        overrides.map((override) => ({
                          ...override,
                          photoCoverIndex: undefined,
                          creatorConsent: false,
                        })),
                      )
                    }}
                  >
                    Remove unavailable attachment {id}
                  </Button>
                ))}
            <Failure error={savedMedia.error} />
            {loadingMedia && (
              <Box render={<output />}>Loading saved attachments…</Box>
            )}
            {savedMedia.isError && (
              <Button
                variant="outline"
                onClick={() => void savedMedia.refetch()}
              >
                Retry attachments
              </Button>
            )}
            <Failure error={channels.error} />
            <Button
              variant="ghost"
              disabled={channels.isFetching}
              onClick={() => void channels.refetch()}
            >
              {channels.isError ? "Retry channels" : "Refresh channels"}
            </Button>
            {channels.data?.channels
              .filter(
                (channel) =>
                  channel.status === "connected" ||
                  selectedTargetIds.has(channel.id),
              )
              .map((channel) => (
                <form.Field key={channel.id} name="channelIds">
                  {(field) => (
                    <Stack>
                      <Check
                        label={channel.displayName}
                        checked={field.state.value.includes(channel.id)}
                        disabled={
                          locked ||
                          (channel.status !== "connected" &&
                            !field.state.value.includes(channel.id))
                        }
                        onChange={(checked) => {
                          field.handleChange(
                            checked
                              ? [...field.state.value, channel.id]
                              : field.state.value.filter(
                                  (id) => id !== channel.id,
                                ),
                          )

                          if (!checked)
                            form.setFieldValue("overrides", (overrides) =>
                              overrides.filter(
                                (override) => override.channelId !== channel.id,
                              ),
                            )
                        }}
                      />
                      {field.state.value.includes(channel.id) && (
                        <form.Field name="overrides">
                          {(overrides) => (
                            <TargetOptions
                              channel={channel}
                              disabled={locked}
                              value={
                                overrides.state.value.find(
                                  (override) =>
                                    override.channelId === channel.id,
                                ) ?? { channelId: channel.id }
                              }
                              media={media}
                              onChange={({ creatorInfo, ...value }) => {
                                if (creatorInfo)
                                  setCreatorSnapshots((snapshots) => ({
                                    ...snapshots,
                                    [channel.id]: creatorInfo,
                                  }))
                                overrides.handleChange([
                                  ...overrides.state.value.filter(
                                    (override) =>
                                      override.channelId !== channel.id,
                                  ),
                                  value,
                                ])
                              }}
                            />
                          )}
                        </form.Field>
                      )}
                    </Stack>
                  )}
                </form.Field>
              ))}
            <form.Field name="channelIds">
              {(field) => (
                <>
                  {field.state.value
                    .filter(
                      (id) =>
                        channels.data &&
                        !channels.data.channels.some(
                          (channel) => channel.id === id,
                        ),
                    )
                    .map((id) => (
                      <Button
                        key={id}
                        variant="outline"
                        disabled={locked}
                        onClick={() => {
                          field.handleChange(
                            field.state.value.filter((item) => item !== id),
                          )
                          form.setFieldValue("overrides", (overrides) =>
                            overrides.filter(
                              (override) => override.channelId !== id,
                            ),
                          )
                        }}
                      >
                        Remove unavailable channel {id}
                      </Button>
                    ))}
                </>
              )}
            </form.Field>
            {channels.data?.channels.length === 0 && (
              <Text>
                Connect a channel to publish. You can save a draft without a
                channel.
              </Text>
            )}
            <label
              htmlFor="composer-field-2"
              {...stylex.props(deskStyles.label)}
            >
              Publish at
              <Input
                id="composer-field-2"
                nativeInput
                type="datetime-local"

                value={scheduled}
                disabled={locked}
                onChange={(event) => setScheduled(event.target.value)}
              />
            </label>
            {post?.scheduledAt && (
              <Text>
                Save draft removes the current schedule. Use Schedule post to
                keep or change the publish time.
              </Text>
            )}
            <Text tone="muted" size="small">
              Publish time uses {workspace.timezone}. Daylight-saving gaps and
              repeated times are rejected.
            </Text>
            <form.Subscribe selector={(state) => state.values}>
              {(value) => (
                <Box
                  render={<section />}
                  aria-label="Post preview"
                  surface="preview"
                >
                  <Heading render={<h3>Preview</h3>} />
                  <Text>{value.text || "Media post"}</Text>
                  <Text>{value.mediaIds.length} attachment(s)</Text>
                  {value.channelIds.map((id) => (
                    <Text key={id}>
                      {channels.data?.channels.find(
                        (channel) => channel.id === id,
                      )?.displayName ?? id}
                      :{" "}
                      {value.overrides.find(
                        (override) => override.channelId === id,
                      )?.text ??
                        (value.text || "Media post")}
                    </Text>
                  ))}
                </Box>
              )}
            </form.Subscribe>
            <form.Subscribe selector={(state) => state.errors}>
              {(errors) => <FormErrors errors={errors} />}
            </form.Subscribe>
            <Failure error={mutation.error} />
            <Flex spacing="normal" wrap align="center">
              <Button
                type="submit"
                variant="outline"
                disabled={locked || upload.isPending}
                onClick={() => {
                  actionRef.current = "draft"
                }}
              >
                Save draft
              </Button>
              <Button
                type="submit"
                disabled={
                  mutation.isPending ||
                  upload.isPending ||
                  uncertainSave ||
                  mediaUnavailable
                }
                onClick={() => {
                  actionRef.current = "publish"
                }}
              >
                {publishStarted ? "Check publish result" : "Publish now"}
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={locked || upload.isPending || mediaUnavailable}
                onClick={() => {
                  actionRef.current = "schedule"
                }}
              >
                Schedule post
              </Button>
            </Flex>
            {publishStarted && mutation.error && (
              <Text>
                Publish outcome may be uncertain. Check uses the same post and
                operation key; it does not create another post.
              </Text>
            )}
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
