import * as stylex from "@stylexjs/stylex"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import type { Post, Workspace } from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import { Input } from "ui/components/ui/input"

import {
  Choice,
  Failure,
  PageHeading,
  deskStyles,
} from "../../../components/desk-ui"
import { rpcMutation, workspaceQuery } from "../queries"
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
  const filter =
    view === "drafts" ? "draft" : view === "calendar" ? "all" : "queue"
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
    <div {...stylex.props(deskStyles.stack)}>
      <PageHeading
        title={
          view === "drafts"
            ? "Drafts"
            : view === "calendar"
              ? "Calendar"
              : "Publishing queue"
        }
      >
        <Button onClick={() => setCompose(true)}>Create post</Button>
      </PageHeading>
      <div {...stylex.props(deskStyles.row)}>
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
        <label {...stylex.props(deskStyles.label)}>
          Calendar date
          <Input
            nativeInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <Button variant="ghost" onClick={() => setDate("")}>
          All dates
        </Button>
      </div>
      <p {...stylex.props(deskStyles.muted)}>
        Workspace timezone: {workspace.timezone}. Review each destination
        outcome separately.
      </p>
      <Failure error={query.error ?? cancel.error ?? remove.error} />
      {query.isPending && <p role="status">Loading posts…</p>}
      {rows?.length === 0 && <p>No posts match this view.</p>}
      {rows?.map((post) => (
        <article key={post.id} {...stylex.props(deskStyles.flat)}>
          <p {...stylex.props(deskStyles.preview)}>
            {post.content.text || "Media post"}
          </p>
          <p>
            {post.state === "cancelled"
              ? "Cancelled"
              : post.state === "needs-review"
                ? "Needs review"
                : post.state.charAt(0).toUpperCase() + post.state.slice(1)}
          </p>
          {post.scheduledAt && (
            <p>
              <time dateTime={post.scheduledAt}>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: workspace.timezone,
                }).format(new Date(post.scheduledAt))}
              </time>{" "}
              · {workspace.timezone}
            </p>
          )}
          {post.reviewReason && <p>{post.reviewReason}</p>}
          {post.deliveries.length > 0 && (
            <section aria-label="Delivery results">
              <h2>Delivery results</h2>
              {post.deliveries.map((delivery) => (
                <section
                  key={delivery.id}
                  aria-label={
                    channels.data?.channels.find(
                      (channel) => channel.id === delivery.channelId,
                    )?.displayName ?? platformNames[delivery.platform]
                  }
                  {...stylex.props(deskStyles.flat)}
                >
                  <h3>
                    {channels.data?.channels.find(
                      (channel) => channel.id === delivery.channelId,
                    )?.displayName ?? platformNames[delivery.platform]}
                  </h3>
                  <p>{states[delivery.state]}</p>
                  {delivery.message && <p>{delivery.message}</p>}
                  {delivery.retryDisposition === "reconcile-first" && (
                    <p>Outcome uncertain. Reconcile before retrying.</p>
                  )}
                  {delivery.url && (
                    <a href={delivery.url} target="_blank" rel="noreferrer">
                      View published post
                    </a>
                  )}
                </section>
              ))}
            </section>
          )}
          <div {...stylex.props(deskStyles.row)}>
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
          </div>
        </article>
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
    </div>
  )
}
