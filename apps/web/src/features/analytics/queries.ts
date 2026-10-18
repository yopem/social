import { workspaceQuery } from "@/lib/queries"

export function analyticsQuery(workspaceId: string) {
  return workspaceQuery(workspaceId, "analytics", (client) =>
    client.AnalyticsRead({ workspaceId }),
  )
}
