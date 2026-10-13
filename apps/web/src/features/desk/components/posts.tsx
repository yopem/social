import * as stylex from "@stylexjs/stylex"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { DateTime, Match } from "effect"
import { useState } from "react"

import { withRpc } from "rpc/client"
import type { PostCursor } from "rpc/contracts/app"
import type { Channel, Post, Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Flex } from "ui/components/ui/flex"
import { Heading } from "ui/components/ui/heading"
import { Input } from "ui/components/ui/input"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"

import { Choice, Failure, PageHeading, deskStyles } from "@/components/desk-ui"
import { execute, rpcMutation, workspaceQuery } from "@/features/desk/queries"

import { platformNames } from "./channels"
import { Composer } from "./composer"
import {
  dateBounds,
  PublicationCalendar,
  workspaceDate,
} from "./publication-calendar"

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

  const [date, setDate] = useState(() =>
    view === "calendar"
      ? workspaceDate(DateTime.nowUnsafe(), workspace.timezone)
      : "",
  )

  const [month, setMonth] = useState(() =>
    workspaceDate(DateTime.nowUnsafe(), workspace.timezone).slice(0, 7),
  )

  const [history, setHistory] = useState(false)
  const [reviewOutcome, setReviewOutcome] = useState<Post | null>(null)
  const [channelId, setChannelId] = useState("")
  const client = useQueryClient()

  const filter = Match.value(view).pipe(
    Match.when("drafts", () => "draft" as const),
    Match.when("calendar", () => "calendar" as const),
    Match.orElse(() => (history ? ("sent" as const) : ("queue" as const))),
  )

  const bounds = date
    ? dateBounds(date, workspace.timezone)
    : view === "calendar"
      ? dateBounds(`${month}-01`, workspace.timezone, "month")
      : {}

  const query = useInfiniteQuery({
    queryKey: [
      "workspace",
      workspaceId,
      "posts",
      filter,
      channelId,
      date,
      month,
      workspace.timezone,
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
        withRpc((rpc) =>
          rpc.PostListPage({
            workspaceId,
            filter,
            channelId: channelId || undefined,
            ...bounds,
            cursor: pageParam ?? undefined,
          }),
        ),
        signal,
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    enabled: bounds !== null,
    retry: false,
  })

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

  const rows = query.data?.pages.flatMap((page) => page.items)

  return (
    <Stack>
      <PostControls
        workspace={workspace}
        view={view}
        invalidDate={bounds === null}
        history={history}
        month={month}
        date={date}
        channelId={channelId}
        channels={channels.data?.channels ?? []}
        onCreate={() => setCompose(true)}
        onHistoryChange={setHistory}
        onMonthChange={setMonth}
        onDateChange={setDate}
        onChannelChange={setChannelId}
      />
      <Text tone="muted" size="small">
        Workspace timezone: {workspace.timezone}. Review each destination
        outcome separately.
      </Text>
      <Failure
        error={query.error ?? channels.error ?? cancel.error ?? remove.error}
      />
      {channels.isError && (
        <Button variant="outline" onClick={() => void channels.refetch()}>
          Retry channels
        </Button>
      )}
      <Button
        variant="outline"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        {query.isError ? "Retry posts" : "Refresh posts"}
      </Button>
      {query.isLoading && <Box render={<output />}>Loading posts…</Box>}
      {rows?.length === 0 && (
        <Box surface="preview">
          <Text>No posts match this view.</Text>
          <Text tone="muted">
            Change the date or channel filter, or create a post.
          </Text>
        </Box>
      )}
      <PostReviewOutcome post={reviewOutcome} workspaceId={workspaceId} />
      {rows?.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          channels={channels.data?.channels ?? []}
          timezone={workspace.timezone}
          cancelling={cancel.isPending}
          removing={remove.isPending}
          onEdit={(item) => {
            setEditing(item)
            setCompose(true)
          }}
          onCancel={(id) => cancel.mutate(id)}
          onDelete={(id) => remove.mutate(id)}
        />
      ))}
      {query.hasNextPage && (
        <Button
          variant="outline"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more posts
        </Button>
      )}
      {compose && (
        <Composer
          workspace={workspace}
          post={editing}
          onClose={(result) => {
            if (result)
              setReviewOutcome(result.state === "needs-review" ? result : null)

            if (
              view === "queue" &&
              result &&
              ["published", "partial", "failed"].includes(result.state)
            )
              setHistory(true)
            setCompose(false)
            setEditing(undefined)
          }}
        />
      )}
    </Stack>
  )
}

export function PostCard({
  post,
  channels,
  timezone,
  cancelling,
  removing,
  onEdit,
  onCancel,
  onDelete,
}: {
  post: Post
  channels: readonly Channel[]
  timezone: string
  cancelling: boolean
  removing: boolean
  onEdit: (post: Post) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
}) {
  return (
    <Box render={<article />} surface="divided">
      <Text variant="preview">{post.content.text || "Media post"}</Text>
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
              timeZone: timezone,
            }).format(new Date(post.scheduledAt))}
          </time>{" "}
          · {timezone}
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
                channels.find((channel) => channel.id === delivery.channelId)
                  ?.displayName ?? platformNames[delivery.platform]
              }
              surface="divided"
            >
              <Heading
                render={
                  <h3>
                    <>
                      {channels.find(
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
      <Flex spacing="normal" wrap align="center">
        {["draft", "scheduled", "needs-review", "cancelled"].includes(
          post.state,
        ) && (
          <Button
            variant="outline"
            onClick={() => {
              onEdit(post)
            }}
          >
            Edit post
          </Button>
        )}
        {post.state === "scheduled" && (
          <Button
            variant="outline"
            disabled={cancelling}
            onClick={() => onCancel(post.id)}
          >
            Cancel scheduled post
          </Button>
        )}
        {post.state === "draft" && (
          <Button
            variant="ghost"
            disabled={removing}
            onClick={() => {
              if (window.confirm("Delete this draft?")) onDelete(post.id)
            }}
          >
            Delete draft
          </Button>
        )}
      </Flex>
    </Box>
  )
}

export function PostControls({
  workspace,
  view,
  invalidDate,
  history,
  month,
  date,
  channelId,
  channels,
  onCreate,
  onHistoryChange,
  onMonthChange,
  onDateChange,
  onChannelChange,
}: {
  workspace: Workspace
  view: "queue" | "drafts" | "calendar"
  invalidDate: boolean
  history: boolean
  month: string
  date: string
  channelId: string
  channels: readonly Channel[]
  onCreate: () => void
  onHistoryChange: (history: boolean) => void
  onMonthChange: (month: string) => void
  onDateChange: (date: string) => void
  onChannelChange: (channelId: string) => void
}) {
  return (
    <>
      <PageHeading
        title={Match.value(view).pipe(
          Match.when("drafts", () => "Drafts"),
          Match.when("calendar", () => "Calendar"),
          Match.orElse(() => "Publishing queue"),
        )}
      >
        <Button onClick={() => onCreate()}>Create post</Button>
      </PageHeading>
      {view === "queue" && (
        <Flex spacing="normal" wrap align="center">
          <Button
            variant={history ? "outline" : "default"}
            aria-pressed={!history}
            onClick={() => onHistoryChange(false)}
          >
            Queue
          </Button>
          <Button
            variant={history ? "default" : "outline"}
            aria-pressed={history}
            onClick={() => onHistoryChange(true)}
          >
            History
          </Button>
        </Flex>
      )}
      {view === "calendar" && (
        <PublicationCalendar
          month={month}
          date={date}
          timezone={workspace.timezone}
          onMonthChange={(next) => {
            onMonthChange(next)
            onDateChange(`${next}-01`)
          }}
          onSelect={onDateChange}
        />
      )}
      <Flex spacing="normal" wrap align="center">
        <Choice
          label="Channel filter"
          value={channelId || "all"}
          options={[
            { value: "all", label: "All channels" },
            ...channels.map((channel) => ({
              value: channel.id,
              label: channel.displayName,
            })),
          ]}
          onChange={(value) => onChannelChange(value === "all" ? "" : value)}
        />
        <label htmlFor="posts-field-1" {...stylex.props(deskStyles.label)}>
          Calendar date
          <Input
            id="posts-field-1"
            nativeInput
            type="date"
            value={date}
            onChange={(event) => {
              onDateChange(event.target.value)

              if (event.target.value)
                onMonthChange(event.target.value.slice(0, 7))
            }}
          />
        </label>
        <Button variant="ghost" onClick={() => onDateChange("")}>
          All dates
        </Button>
      </Flex>
      {invalidDate && <Text role="alert">Choose a valid calendar date.</Text>}
    </>
  )
}

export function PostReviewOutcome({
  post,
  workspaceId,
}: {
  post: Post | null
  workspaceId: string
}) {
  if (!post) return null

  return (
    <Box render={<output />} xstyle={deskStyles.stack}>
      <Text>Post needs review: {post.content.text}</Text>
      <Text>
        {post.reviewReason ?? "Check each destination before publishing again."}
      </Text>
      <Link to="/drafts" search={{ workspace: workspaceId }}>
        Review in Drafts
      </Link>
    </Box>
  )
}
