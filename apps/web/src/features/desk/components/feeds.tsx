import * as stylex from "@stylexjs/stylex"
import { useForm } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Match, Schema } from "effect"
import { useRef, useState } from "react"

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
import { Field, FieldError } from "ui/components/ui/field"
import { Flex } from "ui/components/ui/flex"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Stack } from "ui/components/ui/stack"
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
    <Stack>
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
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isError ? "Retry feeds" : "Refresh feeds"}
      </Button>
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
        <Box render={<article />} key={feed.id} surface="divided">
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
          <Flex spacing="normal" wrap align="center">
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
          </Flex>
        </Box>
      ))}
    </Stack>
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

  const customName = useRef(Boolean(feed))

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
      onBlur: Schema.toStandardSchemaV1(FeedForm),
      onSubmit: Schema.toStandardSchemaV1(FeedForm),
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
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
            <label htmlFor="feeds-field-1" {...stylex.props(deskStyles.label)}>
              Feed URL
              <Input
                id="feeds-field-1"
                type="url"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  field.handleChange(event.target.value)

                  if (!customName.current && URL.canParse(event.target.value))
                    form.setFieldValue(
                      "name",
                      new URL(event.target.value).hostname,
                    )
                }}
              />
            </label>
            {field.state.meta.errors.length > 0 && (
              <FieldError match>
                <FormErrors errors={field.state.meta.errors} />
              </FieldError>
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="name">
        {(field) => (
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
            <label htmlFor="feeds-field-2" {...stylex.props(deskStyles.label)}>
              Feed name
              <Input
                id="feeds-field-2"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => {
                  customName.current = true
                  field.handleChange(event.target.value)
                }}
              />
            </label>
            {field.state.meta.errors.length > 0 && (
              <FieldError match>
                <FormErrors errors={field.state.meta.errors} />
              </FieldError>
            )}
          </Field>
        )}
      </form.Field>
      <form.Field name="mode">
        {(field) => (
          <Field
            invalid={field.state.meta.errors.length > 0}
            touched={field.state.meta.isTouched}
          >
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
            {field.state.meta.errors.length > 0 && (
              <FieldError match>
                <FormErrors errors={field.state.meta.errors} />
              </FieldError>
            )}
          </Field>
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
      <Button
        variant="ghost"
        disabled={channels.isFetching}
        onClick={() => void channels.refetch()}
      >
        {channels.isError ? "Retry channels" : "Refresh channels"}
      </Button>
      {channels.isPending && <Box render={<output />}>Loading channels…</Box>}
      {channels.data?.channels.length === 0 && (
        <Text>
          Connect a channel for automatic publishing. You can import drafts
          without a channel.
        </Text>
      )}
      <form.Field name="channelIds">
        {(field) => (
          <>
            {channels.data?.channels
              .filter(
                (channel) =>
                  channel.status === "connected" ||
                  field.state.value.includes(channel.id),
              )
              .map((channel) => (
                <Check
                  key={channel.id}
                  label={channel.displayName}
                  checked={field.state.value.includes(channel.id)}
                  disabled={
                    save.isPending ||
                    (channel.status !== "connected" &&
                      !field.state.value.includes(channel.id))
                  }
                  onChange={(checked) =>
                    field.handleChange(
                      checked
                        ? [...field.state.value, channel.id]
                        : field.state.value.filter((id) => id !== channel.id),
                    )
                  }
                />
              ))}
            {field.state.value
              .filter(
                (id) =>
                  channels.data &&
                  !channels.data.channels.some((channel) => channel.id === id),
              )
              .map((id) => (
                <Button
                  key={id}
                  variant="outline"
                  disabled={save.isPending}
                  onClick={() =>
                    field.handleChange(
                      field.state.value.filter((item) => item !== id),
                    )
                  }
                >
                  Remove unavailable channel {id}
                </Button>
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
