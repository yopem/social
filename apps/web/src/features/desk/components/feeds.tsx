import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import type { Feed, Workspace } from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/ui/dialog"
import { Input } from "ui/components/ui/input"

import {
  Check,
  Choice,
  Failure,
  FormErrors,
  PageHeading,
  deskStyles,
} from "../../../components/desk-ui"
import { rpcMutation, workspaceQuery } from "../queries"
import { FeedForm } from "../schema"

export function Feeds({ workspace }: { workspace: Workspace }) {
  const workspaceId = workspace.id
  const client = useQueryClient()
  const query = useQuery(
    workspaceQuery(workspaceId, "feeds", (rpc) =>
      rpc.FeedList({ workspaceId }),
    ),
  )
  const refresh = useMutation(
    rpcMutation(client, workspaceId, (rpc, feedId: string) =>
      rpc.FeedRefresh({ workspaceId, feedId }),
    ),
  )
  const remove = useMutation(
    rpcMutation(client, workspaceId, (rpc, feedId: string) =>
      rpc.FeedDelete({ workspaceId, feedId }),
    ),
  )
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Feed>()
  return (
    <div {...stylex.props(deskStyles.stack)}>
      <PageHeading title="RSS automation">
        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) setEditing(undefined)
          }}
        >
          <DialogTrigger render={<Button />}>Add feed</DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit feed" : "Add feed"}</DialogTitle>
            </DialogHeader>
            <DialogPanel>
              <FeedFields
                key={editing?.id ?? "new"}
                workspaceId={workspaceId}
                feed={editing}
                onSaved={() => {
                  setOpen(false)
                  setEditing(undefined)
                }}
              />
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      </PageHeading>
      <p>
        Automatic mode publishes eligible items only. Missing media, consent,
        permissions, or platform choices hold items for review.
      </p>
      <Failure error={query.error ?? refresh.error ?? remove.error} />
      {query.isPending && <p role="status">Loading feeds…</p>}
      {query.data?.length === 0 && (
        <p>Add a feed to import articles into this workspace.</p>
      )}
      {refresh.data && (
        <p role="status">Imported {refresh.data.imported} new item(s).</p>
      )}
      {query.data?.map((feed) => (
        <article key={feed.id} {...stylex.props(deskStyles.flat)}>
          <h2>{feed.name}</h2>
          <p>{feed.url}</p>
          <p>
            {feed.mode === "automatic"
              ? "Automatic publishing"
              : "Draft review"}{" "}
            · {feed.enabled ? "Enabled" : "Paused"}
          </p>
          <p>
            Images: {feed.includeImages ? "Included" : "Excluded"} · Videos:{" "}
            {feed.includeVideos ? "Included" : "Excluded"}
          </p>
          {feed.error && <p role="alert">{feed.error}</p>}
          {feed.lastCheckedAt && (
            <p>Last checked: {new Date(feed.lastCheckedAt).toLocaleString()}</p>
          )}
          <div {...stylex.props(deskStyles.row)}>
            <Button
              variant="outline"
              loading={refresh.isPending && refresh.variables === feed.id}
              onClick={() => refresh.mutate(feed.id)}
            >
              Refresh feed
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setEditing(feed)
                setOpen(true)
              }}
            >
              Edit feed
            </Button>
            <Button
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Delete this feed? Imported posts stay in your workspace.",
                  )
                )
                  remove.mutate(feed.id)
              }}
            >
              Delete feed
            </Button>
          </div>
        </article>
      ))}
    </div>
  )
}

export function FeedFields({
  workspaceId,
  feed,
  onSaved,
}: {
  workspaceId: string
  feed?: Feed
  onSaved: () => void
}) {
  const client = useQueryClient()
  const channels = useQuery(
    workspaceQuery(workspaceId, "channels", (rpc) =>
      rpc.ChannelList({ workspaceId }),
    ),
  )
  const save = useMutation(
    rpcMutation(client, workspaceId, (rpc, value: typeof FeedForm.Type) =>
      rpc.FeedSave({
        workspaceId,
        ...(feed ? { feedId: feed.id } : {}),
        ...value,
      }),
    ),
  )
  const form = useForm({
    defaultValues: {
      url: feed?.url ?? "",
      name: feed?.name ?? "",
      mode: feed?.mode ?? "draft",
      channelIds: feed?.channelIds ?? ([] as readonly string[]),
      includeImages: feed?.includeImages ?? true,
      includeVideos: feed?.includeVideos ?? true,
      enabled: feed?.enabled ?? true,
    },
    validators: { onBlur: FeedForm, onSubmit: FeedForm },
    onSubmit: ({ value }) => save.mutate(value, { onSuccess: onSaved }),
  })
  return (
    <form
      {...stylex.props(deskStyles.stack)}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="url">
        {(field) => (
          <label {...stylex.props(deskStyles.label)}>
            Feed URL
            <Input
              type="url"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => {
                field.handleChange(event.target.value)
                if (URL.canParse(event.target.value))
                  form.setFieldValue(
                    "name",
                    new URL(event.target.value).hostname,
                  )
              }}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="name">
        {(field) => (
          <label {...stylex.props(deskStyles.label)}>
            Feed name
            <Input
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          </label>
        )}
      </form.Field>
      <form.Field name="mode">
        {(field) => (
          <Choice
            label="Import mode"
            value={field.state.value}
            options={[
              { value: "draft", label: "Draft" },
              { value: "automatic", label: "Automatic" },
            ]}
            onBlur={field.handleBlur}
            onChange={(mode) => {
              if (mode === "draft" || mode === "automatic")
                field.handleChange(mode)
            }}
          />
        )}
      </form.Field>
      {(["includeImages", "includeVideos", "enabled"] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <Check
              label={
                name === "includeImages"
                  ? "Include images"
                  : name === "includeVideos"
                    ? "Include videos"
                    : "Enable feed"
              }
              checked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      ))}
      <h3>Target channels</h3>
      <Failure error={channels.error} />
      <form.Field name="channelIds">
        {(field) => (
          <>
            {channels.data?.channels
              .filter((channel) => channel.status === "connected")
              .map((channel) => (
                <Check
                  key={channel.id}
                  label={channel.displayName}
                  checked={field.state.value.includes(channel.id)}
                  onChange={(checked) =>
                    field.handleChange(
                      checked
                        ? [...field.state.value, channel.id]
                        : field.state.value.filter((id) => id !== channel.id),
                    )
                  }
                />
              ))}
          </>
        )}
      </form.Field>
      <p>
        TikTok and other destinations with missing required choices need manual
        review.
      </p>
      <form.Subscribe selector={(state) => state.errors}>
        {(errors) => <FormErrors errors={errors} />}
      </form.Subscribe>
      <Failure error={save.error} />
      <Button type="submit" loading={save.isPending}>
        Save feed
      </Button>
    </form>
  )
}
