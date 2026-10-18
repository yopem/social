import { useQuery } from "@tanstack/react-query"
import { ChartNoAxesCombinedIcon } from "lucide-react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardHeader, CardTitle, CardPanel } from "ui/components/card"
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

import { Failure } from "@/components/desk-ui"
import { workspaceQuery } from "@/lib/queries"

export function Analytics({ workspaceId }: { workspaceId: string }) {
  const query = useQuery(
    workspaceQuery(workspaceId, "analytics", (client) =>
      client.AnalyticsRead({ workspaceId }),
    ),
  )

  const channels = useQuery(
    workspaceQuery(workspaceId, "channels", (client) =>
      client.ChannelList({ workspaceId }),
    ),
  )

  function accountName(channelId: string) {
    return (
      channels.data?.channels.find((channel) => channel.id === channelId)
        ?.displayName ?? channelId
    )
  }

  if (query.isPending)
    return (
      <Stack>
        <Box render={<output />}>Loading analytics…</Box>
        <Skeleton aria-hidden="true" />
      </Stack>
    )

  if (query.error)
    return (
      <Stack>
        <Heading render={<h1>Analytics</h1>} />
        <Failure error={query.error} />
        <HStack>
          <Button
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry analytics
          </Button>
        </HStack>
      </Stack>
    )

  return (
    <Box render={<section />} aria-labelledby="analytics-title">
      <Stack>
        <Heading render={<h1>Analytics</h1>} id="analytics-title" />
        <HStack>
          <Button
            variant="outline"
            disabled={query.isFetching || channels.isFetching}
            onClick={() => {
              void query.refetch()
              void channels.refetch()
            }}
          >
            Refresh analytics
          </Button>
        </HStack>
        <Failure error={channels.error} />
        {channels.isError && (
          <HStack>
            <Button variant="outline" onClick={() => void channels.refetch()}>
              Retry channels
            </Button>
          </HStack>
        )}
        {query.data.channels.length === 0 && (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ChartNoAxesCombinedIcon aria-hidden="true" />
              </EmptyMedia>
              <EmptyTitle>No channel metrics yet</EmptyTitle>
              <EmptyDescription>
                Connect a channel to view available metrics.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {query.data.channels.map((channel) => (
          <Card
            render={<section />}
            key={channel.channelId}
            aria-label={`${accountName(channel.channelId)} metrics`}
          >
            <CardHeader>
              <CardTitle
                render={
                  <h2>
                    <>
                      {accountName(channel.channelId)} · {channel.platform}
                    </>
                  </h2>
                }
              />
            </CardHeader>
            <CardPanel>
              <Stack>
                {!channel.available || channel.metrics.length === 0 ? (
                  <Text>Metrics unavailable. {channel.reason}</Text>
                ) : (
                  <Box render={<dl />}>
                    {channel.metrics.map((metric) => (
                      <Stack key={metric.name}>
                        <Box render={<dt />}>{metric.name}</Box>
                        <Box render={<dd />}>
                          {metric.value} {metric.unit}
                        </Box>
                      </Stack>
                    ))}
                  </Box>
                )}
              </Stack>
            </CardPanel>
          </Card>
        ))}
        {query.data.posts.map((post) => (
          <Card
            render={<section />}
            key={`${post.postId}-${post.channelId}`}
            aria-label={`Post ${post.postId} · ${accountName(post.channelId)} metrics`}
          >
            <CardHeader>
              <CardTitle
                render={
                  <h2>
                    <>
                      Post {post.postId} · {accountName(post.channelId)}
                    </>
                  </h2>
                }
              />
            </CardHeader>
            <CardPanel>
              <Stack>
                {!post.available || post.metrics.length === 0 ? (
                  <Text>Metrics unavailable. {post.reason}</Text>
                ) : (
                  <Box render={<dl />}>
                    {post.metrics.map((metric) => (
                      <Stack key={metric.name}>
                        <Box render={<dt />}>{metric.name}</Box>
                        <Box render={<dd />}>
                          {metric.value} {metric.unit}
                        </Box>
                      </Stack>
                    ))}
                  </Box>
                )}
              </Stack>
            </CardPanel>
          </Card>
        ))}
      </Stack>
    </Box>
  )
}
