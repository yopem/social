import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Match, Schema } from "effect"
import { useState } from "react"

import type { Feed, Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/ui/dialog"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Text } from "ui/components/ui/text"

import {
  Check,
  Choice,
  Failure,
  FormErrors,
  PageHeading,
  deskStyles,
} from "@/components/desk-ui"
import { rpcMutation, workspaceQuery } from "@/features/desk/queries"
import { FeedForm } from "@/features/desk/schema"

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
    <Box xstyle={deskStyles.stack}>
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
      <Text>
        Automatic mode publishes eligible items only. Missing media, consent,
        permissions, or platform choices hold items for review.
      </Text>
      <Failure error={query.error ?? refresh.error ?? remove.error} />
      {query.isPending && <Box render={<output />}>Loading feeds…</Box>}
      {query.data?.length === 0 && (
        <Text>Add a feed to import articles into this workspace.</Text>
      )}
      {refresh.data && (
        <Box render={<output />}>
          Imported {refresh.data.imported} new item(s).
        </Box>
      )}
      {query.data?.map((feed) => (
        <Box render={<article />} key={feed.id} xstyle={deskStyles.flat}>
          <Heading
            render={
              <h2>
                <>{feed.name}</>
              </h2>
            }
          />
          <Text>{feed.url}</Text>
          <Text>
            {feed.mode === "automatic"
              ? "Automatic publishing"
              : "Draft review"}{" "}
            · {feed.enabled ? "Enabled" : "Paused"}
          </Text>
          <Text>
            Images: {feed.includeImages ? "Included" : "Excluded"} · Videos:{" "}
            {feed.includeVideos ? "Included" : "Excluded"}
          </Text>
          {feed.error && <Text role="alert">{feed.error}</Text>}
          {feed.lastCheckedAt && (
            <Text>
              Last checked:{" "}
              {new Date(feed.lastCheckedAt).toLocaleString("en-US", {
                timeZone: workspace.timezone,
              })}
            </Text>
          )}
          <Box xstyle={deskStyles.row}>
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
          </Box>
        </Box>
      ))}
    </Box>
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
        feedId: feed?.id,
        ...value,
      }),
    ),
  )

  const initial: typeof FeedForm.Type = {
    url: feed?.url ?? "",
    name: feed?.name ?? "",
    mode: feed?.mode ?? "draft",
    channelIds: feed?.channelIds ?? [],
    includeImages: feed?.includeImages ?? true,
    includeVideos: feed?.includeVideos ?? true,
    enabled: feed?.enabled ?? true,
  }

  const form = useForm({
    defaultValues: initial,
    validators: {
      onBlur: Schema.standardSchemaV1(FeedForm),
      onSubmit: Schema.standardSchemaV1(FeedForm),
    },
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
          <label htmlFor="feeds-field-1" {...stylex.props(deskStyles.label)}>
            Feed URL
            <Input
              id="feeds-field-1"
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
          <label htmlFor="feeds-field-2" {...stylex.props(deskStyles.label)}>
            Feed name
            <Input
              id="feeds-field-2"
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
              label={Match.value(name).pipe(
                Match.when("includeImages", () => "Include images"),
                Match.when("includeVideos", () => "Include videos"),
                Match.orElse(() => "Enable feed"),
              )}
              checked={field.state.value}
              onChange={field.handleChange}
            />
          )}
        </form.Field>
      ))}
      <Heading render={<h3>Target channels</h3>} />
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
      <Text>
        TikTok and other destinations with missing required choices need manual
        review.
      </Text>
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
