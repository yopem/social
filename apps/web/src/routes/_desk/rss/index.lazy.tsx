import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createLazyFileRoute } from "@tanstack/react-router"
import { DateTime } from "effect"
import { RssIcon } from "lucide-react"
import { useState } from "react"

import type { Feed } from "rpc/contracts/feeds"
import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/card"
import {
  Dialog,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "ui/components/dialog"
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "ui/components/empty"
import { HStack } from "ui/components/hstack"
import { Skeleton } from "ui/components/skeleton"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { deskStyles } from "@/components/desk-styles"
import { Failure, PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { FeedFields } from "@/features/feeds/components/feed-fields"
import {
  feedsQuery,
  refreshFeedMutation,
  deleteFeedMutation,
} from "@/features/feeds/queries"

export const Route = createLazyFileRoute("/_desk/rss/")({
  component: FeedsPage,
})

export function FeedsPage() {
  const workspace = useDeskWorkspace()
  const client = useQueryClient()
  const feeds = useQuery(feedsQuery(workspace.id))

  const refresh = useMutation(
    refreshFeedMutation({ client, workspaceId: workspace.id }),
  )

  const removal = useMutation(
    deleteFeedMutation({ client, workspaceId: workspace.id }),
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
          <HStack>
            <DialogTrigger render={<Button />}>Add feed</DialogTrigger>
          </HStack>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit feed" : "Add feed"}</DialogTitle>
            </DialogHeader>
            <DialogPanel>
              <FeedFields
                key={editing?.id ?? "new"}
                workspaceId={workspace.id}
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
      <Failure error={feeds.error ?? refresh.error ?? removal.error} />
      <HStack>
        <Button
          variant="outline"
          disabled={feeds.isFetching}
          onClick={() => void feeds.refetch()}
        >
          {feeds.isError ? "Retry feeds" : "Refresh feeds"}
        </Button>
      </HStack>
      {feeds.isPending && (
        <Stack>
          <Box render={<output />}>Loading feeds…</Box>
          <Skeleton aria-hidden="true" />
        </Stack>
      )}
      {feeds.data?.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <RssIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No feeds yet</EmptyTitle>
            <EmptyDescription>
              Add a feed to import articles into this workspace.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {refresh.data && (
        <Box render={<output />}>
          Imported {refresh.data.imported} new item(s).
        </Box>
      )}
      {feeds.data?.map((feed) => (
        <Card render={<article />} key={feed.id}>
          <CardHeader>
            <CardTitle
              render={
                <h2>
                  <>{feed.name}</>
                </h2>
              }
            />
          </CardHeader>
          <CardPanel>
            <Stack>
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
                  {DateTime.format(
                    DateTime.makeZonedUnsafe(feed.lastCheckedAt, {
                      timeZone: workspace.timezone,
                    }),
                    {
                      locale: "en-US",
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                    },
                  )}
                </Text>
              )}
              <HStack
                xstyle={[
                  deskStyles.rowGap,
                  deskStyles.wrap,
                  deskStyles.alignCenter,
                ]}
              >
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
                  disabled={removal.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        "Delete this feed? Imported posts stay in your workspace.",
                      )
                    )
                      removal.mutate(feed.id)
                  }}
                >
                  Delete feed
                </Button>
              </HStack>
            </Stack>
          </CardPanel>
        </Card>
      ))}
    </Stack>
  )
}
