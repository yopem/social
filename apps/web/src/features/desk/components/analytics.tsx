import { useQuery } from "@tanstack/react-query"

import { Box } from "ui/components/ui/box"
import { Heading } from "ui/components/ui/heading"
import { Text } from "ui/components/ui/text"

import { errorMessage, workspaceQuery } from "@/features/desk/queries"

export function Analytics({ workspaceId }: { workspaceId: string }) {
  const query = useQuery(
    workspaceQuery(workspaceId, "analytics", (client) =>
      client.AnalyticsRead({ workspaceId }),
    ),
  )

  if (query.isPending) return <Box render={<output />}>Loading analytics…</Box>

  if (query.error) return <Text role="alert">{errorMessage(query.error)}</Text>

  return (
    <Box render={<section />} aria-labelledby="analytics-title">
      <Heading render={<h1>Analytics</h1>} id="analytics-title" />
      {query.data.channels.length === 0 && (
        <Text>Connect a channel to view available metrics.</Text>
      )}
      {query.data.channels.map((channel) => (
        <Box
          render={<section />}
          key={channel.channelId}
          aria-label={`${channel.platform} metrics`}
        >
          <Heading
            render={
              <h2>
                <>{channel.platform}</>
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
          aria-label={`Post ${post.postId} metrics`}
        >
          <Heading
            render={
              <h2>
                <>Post {post.postId}</>
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
