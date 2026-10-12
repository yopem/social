import * as stylex from "@stylexjs/stylex"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Match } from "effect"
import { useState } from "react"

import type { Post, Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Text } from "ui/components/ui/text"

import { Choice, Failure, PageHeading, deskStyles } from "@/components/desk-ui"
import { rpcMutation, workspaceQuery } from "@/features/desk/queries"

import { platformNames } from "./channels"
import { Composer } from "./composer"

const states = {
  "not-submitted": "Not submitted",
  scheduled: "Scheduled",
  accepted: "Accepted",
  processing: "Processing",
  published: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
  unknown: "Unknown",
} as const

export function Posts({
  workspace,
  view,
}: {
  workspace: Workspace
  view: "queue" | "drafts" | "calendar"
}) {
  const workspaceId = workspace.id
  const [compose, setCompose] = useState(false)
  const [editing, setEditing] = useState<Post>()
  const [date, setDate] = useState("")
  const [channelId, setChannelId] = useState("")
  const client = useQueryClient()

  const filter = view === "drafts" ? "draft" : "all"

  const query = useQuery(
    workspaceQuery(
      workspaceId,
      "posts",
      (rpc) => rpc.PostList({ workspaceId, filter }),
      filter,
    ),
  )

  const channels = useQuery(
    workspaceQuery(workspaceId, "channels", (rpc) =>
      rpc.ChannelList({ workspaceId }),
    ),
  )

  const cancel = useMutation(
    rpcMutation(client, workspaceId, (rpc, postId: string) =>
      rpc.PostCancel({ workspaceId, postId }),
    ),
  )

  const remove = useMutation(
    rpcMutation(client, workspaceId, (rpc, postId: string) =>
      rpc.PostDelete({ workspaceId, postId }),
    ),
  )

  const rows = query.data?.filter(
    (post) =>
      (view !== "calendar" ||
        post.scheduledAt !== null ||
        post.state === "cancelled") &&
      (!channelId || post.content.channelIds.includes(channelId)) &&
      (!date ||
        (post.scheduledAt !== null &&
          new Intl.DateTimeFormat("en-CA", {
            timeZone: workspace.timezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date(post.scheduledAt)) === date)),
  )

  return (
    <Box xstyle={deskStyles.stack}>
      <PageHeading
        title={Match.value(view).pipe(
          Match.when("drafts", () => "Drafts"),
          Match.when("calendar", () => "Calendar"),
          Match.orElse(() => "Publishing queue"),
        )}
      >
        <Button onClick={() => setCompose(true)}>Create post</Button>
      </PageHeading>
      <Box xstyle={deskStyles.row}>
        <Choice
          label="Channel filter"
          value={channelId || "all"}
          options={[
            { value: "all", label: "All channels" },
            ...(channels.data?.channels.map((channel) => ({
              value: channel.id,
              label: channel.displayName,
            })) ?? []),
          ]}
          onChange={(value) => setChannelId(value === "all" ? "" : value)}
        />
        <label htmlFor="posts-field-1" {...stylex.props(deskStyles.label)}>
          Calendar date
          <Input
            id="posts-field-1"
            nativeInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <Button variant="ghost" onClick={() => setDate("")}>
          All dates
        </Button>
      </Box>
      <Text xstyle={deskStyles.muted}>
        Workspace timezone: {workspace.timezone}. Review each destination
        outcome separately.
      </Text>
      <Failure error={query.error ?? cancel.error ?? remove.error} />
      {query.isPending && <Box render={<output />}>Loading posts…</Box>}
      {rows?.length === 0 && <Text>No posts match this view.</Text>}
      {rows?.map((post) => (
        <Box render={<article />} key={post.id} xstyle={deskStyles.flat}>
          <Text xstyle={deskStyles.preview}>
            {post.content.text || "Media post"}
          </Text>
          <Text>
            {post.state === "needs-review"
              ? "Needs review"
              : post.state.charAt(0).toUpperCase() + post.state.slice(1)}
          </Text>
          {post.scheduledAt && (
            <Text>
              <time dateTime={post.scheduledAt}>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: workspace.timezone,
                }).format(new Date(post.scheduledAt))}
              </time>{" "}
              · {workspace.timezone}
            </Text>
          )}
          {post.reviewReason && <Text>{post.reviewReason}</Text>}
          {post.deliveries.length > 0 && (
            <Box render={<section />} aria-label="Delivery results">
              <Heading render={<h2>Delivery results</h2>} />
              {post.deliveries.map((delivery) => (
                <Box
                  render={<section />}
                  key={delivery.id}
                  aria-label={
                    channels.data?.channels.find(
                      (channel) => channel.id === delivery.channelId,
                    )?.displayName ?? platformNames[delivery.platform]
                  }
                  xstyle={deskStyles.flat}
                >
                  <Heading
                    render={
                      <h3>
                        <>
                          {channels.data?.channels.find(
                            (channel) => channel.id === delivery.channelId,
                          )?.displayName ?? platformNames[delivery.platform]}
                        </>
                      </h3>
                    }
                  />
                  <Text>{states[delivery.state]}</Text>
                  {delivery.message && <Text>{delivery.message}</Text>}
                  {delivery.retryDisposition === "reconcile-first" && (
                    <Text>Outcome uncertain. Reconcile before retrying.</Text>
                  )}
                  {delivery.url && (
                    <a href={delivery.url} target="_blank" rel="noreferrer">
                      View published post
                    </a>
                  )}
                </Box>
              ))}
            </Box>
          )}
          <Box xstyle={deskStyles.row}>
            {["draft", "scheduled", "needs-review", "cancelled"].includes(
              post.state,
            ) && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(post)
                  setCompose(true)
                }}
              >
                Edit post
              </Button>
            )}
            {post.state === "scheduled" && (
              <Button
                variant="outline"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(post.id)}
              >
                Cancel scheduled post
              </Button>
            )}
            {post.state === "draft" && (
              <Button
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm("Delete this draft?"))
                    remove.mutate(post.id)
                }}
              >
                Delete draft
              </Button>
            )}
          </Box>
        </Box>
      ))}
      {compose && (
        <Composer
          workspace={workspace}
          post={editing}
          onClose={() => {
            setCompose(false)
            setEditing(undefined)
          }}
        />
      )}
    </Box>
  )
}
