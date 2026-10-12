import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Effect } from "effect"
import { useRef, useState } from "react"

import { withRpc } from "rpc/client"
import {
  ApiError,
  type Media,
  type Post,
  type PostContent,
  type Workspace,
} from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "ui/components/ui/dialog"
import { Field, FieldLabel } from "ui/components/ui/field"
import { Input } from "ui/components/ui/input"
import { Textarea } from "ui/components/ui/textarea"

import {
  Check,
  Failure,
  FormErrors,
  deskStyles,
} from "../../../components/desk-ui"
import { validatePublishing } from "../publishing"
import { effectMutation, mediaMutation, workspaceQuery } from "../queries"
import { ComposerForm, scheduleTime } from "../schema"
import { TargetOptions } from "./target-options"

export function Composer({
  workspace,
  post,
  onClose,
}: {
  workspace: Workspace
  post?: Post
  onClose: () => void
}) {
  const workspaceId = workspace.id
  const client = useQueryClient()
  const channels = useQuery(
    workspaceQuery(workspaceId, "channels", (rpc) =>
      rpc.ChannelList({ workspaceId }),
    ),
  )
  const [media, setMedia] = useState<readonly Media[]>([])
  const [scheduled, setScheduled] = useState("")
  const actionRef = useRef<"draft" | "publish" | "schedule">("draft")
  const operation = useRef<{
    postId?: string
    key?: string
    publishStarted: boolean
    uncertainSave: boolean
  }>({
    ...(post ? { postId: post.id } : {}),
    publishStarted: false,
    uncertainSave: false,
  })
  const upload = useMutation(mediaMutation(workspaceId))
  const [publishStarted, setPublishStarted] = useState(false)
  const [uncertainSave, setUncertainSave] = useState(false)
  const mutation = useMutation({
    ...effectMutation((content: PostContent) =>
      Effect.gen(function* () {
        const action = actionRef.current
        if (operation.current.uncertainSave)
          return yield* Effect.fail(
            new ApiError({
              code: "conflict",
              message:
                "Save outcome is unknown. Reload and review the draft list before creating another post.",
            }),
          )
        if (action !== "draft")
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
          operation.current.publishStarted && operation.current.postId
            ? null
            : yield* withRpc((rpc) =>
                rpc.PostSave({
                  workspaceId,
                  ...(operation.current.postId
                    ? { postId: operation.current.postId }
                    : {}),
                  content,
                  scheduledAt,
                }),
              ).pipe(
                Effect.tapError((error) =>
                  Effect.sync(() => {
                    if (
                      !(error instanceof ApiError) &&
                      !operation.current.postId
                    ) {
                      operation.current.uncertainSave = true
                      setUncertainSave(true)
                    }
                  }),
                ),
              )
        if (saved) operation.current.postId = saved.id
        if (action !== "publish") return saved
        const postId = operation.current.postId
        if (!postId)
          return yield* Effect.fail(
            new ApiError({
              code: "conflict",
              message: "Save the post before publishing.",
            }),
          )
        operation.current.key ??= crypto.randomUUID()
        operation.current.publishStarted = true
        setPublishStarted(true)
        return yield* withRpc((rpc) =>
          rpc.PostPublish({
            workspaceId,
            postId,
            idempotencyKey: operation.current.key ?? "",
          }),
        )
      }),
    ),
    retry: false,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["workspace", workspaceId] })
      onClose()
    },
  })
  const initial: PostContent = post?.content ?? {
    text: "",
    mediaIds: [],
    channelIds: [],
    overrides: [],
  }
  const form = useForm({
    defaultValues: initial,
    validators: { onBlur: ComposerForm, onSubmit: ComposerForm },
    onSubmit: ({ value }) => mutation.mutate(value),
  })
  function resetConsent() {
    form.setFieldValue("overrides", (overrides) =>
      overrides.map((override) => ({ ...override, creatorConsent: false })),
    )
  }
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
                <Field>
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
                </Field>
              )}
            </form.Field>
            <label {...stylex.props(deskStyles.label)}>
              Add images or video
              <Input
                nativeInput
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                disabled={locked || upload.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file)
                    upload.mutate(file, {
                      onSuccess: (uploaded) => {
                        setMedia((items) => [...items, uploaded])
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
            {upload.isPending && <p role="status">Uploading media…</p>}
            {media.map((item) => (
              <div key={item.id} {...stylex.props(deskStyles.row)}>
                <a href={item.url} target="_blank" rel="noreferrer">
                  {item.name}
                </a>
                <Button
                  variant="ghost"
                  disabled={locked}
                  onClick={() => {
                    setMedia(media.filter((current) => current.id !== item.id))
                    form.setFieldValue("mediaIds", (ids) =>
                      ids.filter((id) => id !== item.id),
                    )
                    resetConsent()
                  }}
                >
                  Remove {item.name}
                </Button>
              </div>
            ))}
            {post && post.content.mediaIds.length > 0 && (
              <p>
                {post.content.mediaIds.length} saved attachment(s). Existing
                attachments stay attached.
              </p>
            )}
            <Failure error={channels.error} />
            {channels.data?.channels
              .filter((channel) => channel.status !== "disconnected")
              .map((channel) => (
                <form.Field key={channel.id} name="channelIds">
                  {(field) => (
                    <div {...stylex.props(deskStyles.stack)}>
                      <Check
                        label={channel.displayName}
                        checked={field.state.value.includes(channel.id)}
                        disabled={locked || channel.status !== "connected"}
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
                              value={
                                overrides.state.value.find(
                                  (override) =>
                                    override.channelId === channel.id,
                                ) ?? { channelId: channel.id }
                              }
                              media={media}
                              onChange={(value) =>
                                overrides.handleChange([
                                  ...overrides.state.value.filter(
                                    (override) =>
                                      override.channelId !== channel.id,
                                  ),
                                  value,
                                ])
                              }
                            />
                          )}
                        </form.Field>
                      )}
                    </div>
                  )}
                </form.Field>
              ))}
            {channels.data?.channels.length === 0 && (
              <p>
                Connect a channel to publish. You can save a draft without a
                channel.
              </p>
            )}
            <label {...stylex.props(deskStyles.label)}>
              Publish at
              <Input
                nativeInput
                type="datetime-local"
                role="textbox"
                value={scheduled}
                disabled={locked}
                onChange={(event) => setScheduled(event.target.value)}
              />
            </label>
            <p {...stylex.props(deskStyles.muted)}>
              Publish time uses {workspace.timezone}. Daylight-saving gaps and
              repeated times are rejected.
            </p>
            <form.Subscribe selector={(state) => state.values}>
              {(value) => (
                <section
                  aria-label="Post preview"
                  {...stylex.props(deskStyles.preview)}
                >
                  <h3>Preview</h3>
                  <p>{value.text || "Media post"}</p>
                  <p>{value.mediaIds.length} attachment(s)</p>
                  {value.channelIds.map((id) => (
                    <p key={id}>
                      {
                        channels.data?.channels.find(
                          (channel) => channel.id === id,
                        )?.displayName
                      }
                    </p>
                  ))}
                </section>
              )}
            </form.Subscribe>
            <form.Subscribe selector={(state) => state.errors}>
              {(errors) => <FormErrors errors={errors} />}
            </form.Subscribe>
            <Failure error={mutation.error} />
            <div {...stylex.props(deskStyles.row)}>
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
                  mutation.isPending || upload.isPending || uncertainSave
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
                disabled={locked || upload.isPending}
                onClick={() => {
                  actionRef.current = "schedule"
                }}
              >
                Schedule post
              </Button>
            </div>
            {publishStarted && mutation.error && (
              <p>
                Publish outcome may be uncertain. Check uses the same post and
                operation key; it does not create another post.
              </p>
            )}
          </form>
        </DialogPanel>
      </DialogPopup>
    </Dialog>
  )
}
