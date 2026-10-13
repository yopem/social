import { useQuery } from "@tanstack/react-query"

import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Heading } from "ui/components/ui/heading"
import { Text } from "ui/components/ui/text"

import { Failure } from "@/components/desk-ui"
import { workspaceQuery } from "@/features/desk/queries"

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

  if (query.isPending) return <Box render={<output />}>Loading analytics…</Box>

  if (query.error)
    return (
      <Box>
        <Heading render={<h1>Analytics</h1>} />
        <Failure error={query.error} />
        <Button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          Retry analytics
        </Button>
      </Box>
    )

  return (
    <Box render={<section />} aria-labelledby="analytics-title">
      <Heading render={<h1>Analytics</h1>} id="analytics-title" />
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
      <Failure error={channels.error} />
      {channels.isError && (
        <Button variant="outline" onClick={() => void channels.refetch()}>
          Retry channels
        </Button>
      )}
      {query.data.channels.length === 0 && (
        <Text>Connect a channel to view available metrics.</Text>
      )}
      {query.data.channels.map((channel) => (
        <Box
          render={<section />}
          key={channel.channelId}
          aria-label={`${accountName(channel.channelId)} metrics`}
        >
          <Heading
            render={
              <h2>
                <>
                  {accountName(channel.channelId)} · {channel.platform}
                </>
              </h2>
            }
          />
          {!channel.available || channel.metrics.length === 0 ? (
            <Text>Metrics unavailable. {channel.reason}</Text>
          ) : (
            <Box render={<dl />}>
              {channel.metrics.map((metric) => (
                <Box key={metric.name}>
                  <Box render={<dt />}>{metric.name}</Box>
                  <Box render={<dd />}>
                    {metric.value} {metric.unit}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
      {query.data.posts.map((post) => (
        <Box
          render={<section />}
          key={`${post.postId}-${post.channelId}`}
          aria-label={`Post ${post.postId} · ${accountName(post.channelId)} metrics`}
        >
          <Heading
            render={
              <h2>
                <>
                  Post {post.postId} · {accountName(post.channelId)}
                </>
              </h2>
            }
          />
          {!post.available || post.metrics.length === 0 ? (
            <Text>Metrics unavailable. {post.reason}</Text>
          ) : (
            <Box render={<dl />}>
              {post.metrics.map((metric) => (
                <Box key={metric.name}>
                  <Box render={<dt />}>{metric.name}</Box>
                  <Box render={<dd />}>
                    {metric.value} {metric.unit}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
