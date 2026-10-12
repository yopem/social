import { useQuery } from "@tanstack/react-query"

import { errorMessage, workspaceQuery } from "../queries"

export function Analytics({ workspaceId }: { workspaceId: string }) {
  const query = useQuery(
    workspaceQuery(workspaceId, "analytics", (client) =>
      client.AnalyticsRead({ workspaceId }),
    ),
  )
  if (query.isPending) return <p role="status">Loading analytics…</p>
  if (query.error) return <p role="alert">{errorMessage(query.error)}</p>
  return (
    <section aria-labelledby="analytics-title">
      <h1 id="analytics-title">Analytics</h1>
      {query.data.channels.length === 0 && (
        <p>Connect a channel to view available metrics.</p>
      )}
      {query.data.channels.map((channel) => (
        <section
          key={channel.channelId}
          aria-label={`${channel.platform} metrics`}
        >
          <h2>{channel.platform}</h2>
          {!channel.available || channel.metrics.length === 0 ? (
            <p>Metrics unavailable. {channel.reason}</p>
          ) : (
            <dl>
              {channel.metrics.map((metric) => (
                <div key={metric.name}>
                  <dt>{metric.name}</dt>
                  <dd>
                    {metric.value} {metric.unit}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
      {query.data.posts.map((post) => (
        <section
          key={`${post.postId}-${post.channelId}`}
          aria-label={`Post ${post.postId} metrics`}
        >
          <h2>Post {post.postId}</h2>
          {post.metrics.length === 0 ? (
            <p>Metrics unavailable.</p>
          ) : (
            <dl>
              {post.metrics.map((metric) => (
                <div key={metric.name}>
                  <dt>{metric.name}</dt>
                  <dd>
                    {metric.value} {metric.unit}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </section>
  )
}
