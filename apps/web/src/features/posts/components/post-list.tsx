import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Array, HashMap, Match, Option, String } from "effect"
import { FileTextIcon } from "lucide-react"

import type { Channel } from "rpc/contracts/channels"
import type { Post, PostListPageInput } from "rpc/contracts/posts"
import type { Workspace } from "rpc/contracts/workspaces"
import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardPanel } from "ui/components/card"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "ui/components/empty"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Skeleton } from "ui/components/skeleton"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"
import { platformNames } from "@/features/channels/platform-names"
import { channelsQuery } from "@/features/channels/queries"
import { formatScheduledAt } from "@/features/posts/format"
import {
  postsQuery,
  cancelPostMutation,
  deletePostMutation,
  type PostBrowseCriteria,
} from "@/features/posts/queries"

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

export function PostList({
  workspace,
  filter,
  criteria,
  reviewOutcome,
  onEdit,
}: {
  workspace: Workspace
  filter: (typeof PostListPageInput.Type)["filter"]
  criteria: PostBrowseCriteria
  reviewOutcome: Post | null
  onEdit: (post: Post) => void
}) {
  const workspaceId = workspace.id
  const client = useQueryClient()
  const posts = useInfiniteQuery(postsQuery({ workspaceId, filter, criteria }))
  const channels = useQuery(channelsQuery(workspaceId))
  const cancellation = useMutation(cancelPostMutation({ client, workspaceId }))
  const removal = useMutation(deletePostMutation({ client, workspaceId }))
  const rows = posts.data?.pages.flatMap((page) => page.items)

  return (
    <Stack>
      <Text xstyle={[deskStyles.text, deskStyles.muted, deskStyles.small]}>
        Workspace timezone: {workspace.timezone}. Review each destination
        outcome separately.
      </Text>
      <Failure
        error={
          posts.error ?? channels.error ?? cancellation.error ?? removal.error
        }
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
          disabled={posts.isFetching}
          onClick={() => void posts.refetch()}
        >
          {posts.isError ? "Retry posts" : "Refresh posts"}
        </Button>
      </HStack>
      <PostListState loading={posts.isLoading} posts={rows} />
      <PostReviewOutcome post={reviewOutcome} workspaceId={workspaceId} />
      {rows?.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          channels={channels.data?.channels ?? []}
          timezone={workspace.timezone}
          cancelling={cancellation.isPending}
          removing={removal.isPending}
          onEdit={onEdit}
          onCancel={(id) => cancellation.mutate(id)}
          onDelete={(id) => removal.mutate(id)}
        />
      ))}
      {posts.hasNextPage && (
        <HStack>
          <Button
            variant="outline"
            loading={posts.isFetchingNextPage}
            onClick={() => void posts.fetchNextPage()}
          >
            Load more posts
          </Button>
        </HStack>
      )}
    </Stack>
  )
}

export function PostListState({
  loading,
  posts,
}: {
  loading: boolean
  posts: readonly Post[] | undefined
}) {
  if (loading)
    return (
      <Stack>
        <Box render={<output />}>Loading posts…</Box>
        <Skeleton aria-hidden="true" />
      </Stack>
    )

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
  const channelNames = HashMap.fromIterable(
    Array.reverse(channels).map(
      (channel) => [channel.id, channel.displayName] as const,
    ),
  )

  return (
    <Card render={<article />}>
      <CardPanel>
        <Stack>
          <Text xstyle={[deskStyles.text, deskStyles.preview]}>
            {post.content.text || "Media post"}
          </Text>
          <Text>
            {Match.value(post.state).pipe(
              Match.when("needs-review", () => "Needs review"),
              Match.orElse(String.capitalize),
            )}
          </Text>
          {post.scheduledAt && (
            <Text>
              <time dateTime={post.scheduledAt}>
                {formatScheduledAt({ timestamp: post.scheduledAt, timezone })}
              </time>{" "}
              · {timezone}
            </Text>
          )}
          {post.reviewReason && <Text>{post.reviewReason}</Text>}
          {post.deliveries.length > 0 && (
            <Box render={<section />} aria-label="Delivery results">
              <Heading render={<h2>Delivery results</h2>} />
              {post.deliveries.map((delivery) => {
                const channelName = Option.getOrElse(
                  HashMap.get(channelNames, delivery.channelId),
                  () => platformNames[delivery.platform],
                )

                return (
                  <Card
                    render={<section />}
                    key={delivery.id}
                    aria-label={channelName}
                  >
                    <CardPanel>
                      <Stack>
                        <Heading render={<h3>{channelName}</h3>} />
                        <Text>{states[delivery.state]}</Text>
                        {delivery.message && <Text>{delivery.message}</Text>}
                        {delivery.retryDisposition === "reconcile-first" && (
                          <Text>
                            Outcome uncertain. Reconcile before retrying.
                          </Text>
                        )}
                        {delivery.url && (
                          <a
                            href={delivery.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            View published post
                          </a>
                        )}
                      </Stack>
                    </CardPanel>
                  </Card>
                )
              })}
            </Box>
          )}
          <HStack
            xstyle={[
              deskStyles.rowGap,
              deskStyles.wrap,
              deskStyles.alignCenter,
            ]}
          >
            {Match.value(post.state).pipe(
              Match.whenOr(
                "draft",
                "scheduled",
                "needs-review",
                "cancelled",
                () => true,
              ),
              Match.orElse(() => false),
            ) && (
              <HStack>
                <Button variant="outline" onClick={() => onEdit(post)}>
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
