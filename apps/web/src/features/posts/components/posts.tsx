import * as stylex from "@stylexjs/stylex"
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { DateTime, Match } from "effect"
import { FileTextIcon } from "lucide-react"
import { useState } from "react"

import { withRpc } from "rpc/client"
import type { Channel } from "rpc/contracts/channels"
import type { PostCursor } from "rpc/contracts/posts"
import type { Post } from "rpc/contracts/posts"
import type { Workspace } from "rpc/contracts/workspaces"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Card, CardPanel } from "ui/components/ui/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "ui/components/ui/empty"
import { Heading } from "ui/components/ui/heading"
import { HStack } from "ui/components/ui/hstack"
import { Input } from "ui/components/ui/input"
import { Skeleton } from "ui/components/ui/skeleton"
import { Stack } from "ui/components/ui/stack"
import { Tabs, TabsList, TabsTab, TabsPanel } from "ui/components/ui/tabs"
import { Text } from "ui/components/ui/text"

import { deskStyles } from "@/components/desk-styles"
import { Choice, Failure, PageHeading } from "@/components/desk-ui"
import { platformNames } from "@/features/channels/components/channels"
import { Composer } from "@/features/posts/components/composer"
import {
  dateBounds,
  PublicationCalendar,
  workspaceDate,
} from "@/features/posts/components/publication-calendar"
import { execute, rpcMutation, workspaceQuery } from "@/lib/queries"

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

  const results = (
    <Stack>
      <Text xstyle={[deskStyles.text, deskStyles.muted, deskStyles.small]}>
        Workspace timezone: {workspace.timezone}. Review each destination
        outcome separately.
      </Text>
      <Failure
        error={query.error ?? channels.error ?? cancel.error ?? remove.error}
      />
      {channels.isError && (
        <HStack>
          <Button variant="outline" onClick={() => void channels.refetch()}>
            Retry channels
          </Button>
        </HStack>
      )}
      <HStack>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          {query.isError ? "Retry posts" : "Refresh posts"}
        </Button>
      </HStack>
      <PostListState loading={query.isLoading} posts={rows} />
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
        <HStack>
          <Button
            variant="outline"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            Load more posts
          </Button>
        </HStack>
      )}
    </Stack>
  )

  const content = (
    <Stack>
      <PostControls
        workspace={workspace}
        view={view}
        invalidDate={bounds === null}
        month={month}
        date={date}
        channelId={channelId}
        channels={channels.data?.channels ?? []}
        onCreate={() => setCompose(true)}
        onMonthChange={setMonth}
        onDateChange={setDate}
        onChannelChange={setChannelId}
      />
      {view === "queue" ? (
        <TabsPanel value={history ? "history" : "queue"}>{results}</TabsPanel>
      ) : (
        results
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

  if (view !== "queue") return content

  return (
    <Tabs
      value={history ? "history" : "queue"}
      onValueChange={(value) => {
        if (value === "queue" || value === "history")
          setHistory(value === "history")
      }}
    >
      {content}
    </Tabs>
  )
}

export function PostListState({
  loading,
  posts,
}: {
  loading: boolean
  posts: readonly Post[] | undefined
}) {
  if (loading) {
    return (
      <Stack>
        <Box render={<output />}>Loading posts…</Box>
        <Skeleton aria-hidden="true" />
      </Stack>
    )
  }

  if (posts?.length !== 0) return null

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileTextIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No posts match this view.</EmptyTitle>
        <EmptyDescription>
          Change the date or channel filter, or create a post.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
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
    <Card render={<article />}>
      <CardPanel>
        <Stack>
          <Text xstyle={[deskStyles.text, deskStyles.preview]}>
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
                <Card
                  render={<section />}
                  key={delivery.id}
                  aria-label={
                    channels.find(
                      (channel) => channel.id === delivery.channelId,
                    )?.displayName ?? platformNames[delivery.platform]
                  }
                >
                  <CardPanel>
                    <Stack>
                      <Heading
                        render={
                          <h3>
                            <>
                              {channels.find(
                                (channel) => channel.id === delivery.channelId,
                              )?.displayName ??
                                platformNames[delivery.platform]}
                            </>
                          </h3>
                        }
                      />
                      <Text>{states[delivery.state]}</Text>
                      {delivery.message && <Text>{delivery.message}</Text>}
                      {delivery.retryDisposition === "reconcile-first" && (
                        <Text>
                          Outcome uncertain. Reconcile before retrying.
                        </Text>
                      )}
                      {delivery.url && (
                        <a href={delivery.url} target="_blank" rel="noreferrer">
                          View published post
                        </a>
                      )}
                    </Stack>
                  </CardPanel>
                </Card>
              ))}
            </Box>
          )}
          <HStack
            xstyle={[
              deskStyles.rowGap,
              deskStyles.wrap,
              deskStyles.alignCenter,
            ]}
          >
            {["draft", "scheduled", "needs-review", "cancelled"].includes(
              post.state,
            ) && (
              <HStack>
                <Button
                  variant="outline"
                  onClick={() => {
                    onEdit(post)
                  }}
                >
                  Edit post
                </Button>
              </HStack>
            )}
            {post.state === "scheduled" && (
              <HStack>
                <Button
                  variant="outline"
                  disabled={cancelling}
                  onClick={() => onCancel(post.id)}
                >
                  Cancel scheduled post
                </Button>
              </HStack>
            )}
            {post.state === "draft" && (
              <HStack>
                <Button
                  variant="ghost"
                  disabled={removing}
                  onClick={() => {
                    if (window.confirm("Delete this draft?")) onDelete(post.id)
                  }}
                >
                  Delete draft
                </Button>
              </HStack>
            )}
          </HStack>
        </Stack>
      </CardPanel>
    </Card>
  )
}

export function PostControls({
  workspace,
  view,
  invalidDate,
  month,
  date,
  channelId,
  channels,
  onCreate,
  onMonthChange,
  onDateChange,
  onChannelChange,
}: {
  workspace: Workspace
  view: "queue" | "drafts" | "calendar"
  invalidDate: boolean
  month: string
  date: string
  channelId: string
  channels: readonly Channel[]
  onCreate: () => void
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
        <HStack>
          <Button onClick={() => onCreate()}>Create post</Button>
        </HStack>
      </PageHeading>
      {view === "queue" && (
        <TabsList variant="underline" aria-label="Post view">
          <TabsTab value="queue">Queue</TabsTab>
          <TabsTab value="history">History</TabsTab>
        </TabsList>
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
      <HStack
        xstyle={[deskStyles.rowGap, deskStyles.wrap, deskStyles.alignCenter]}
      >
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
      </HStack>
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
