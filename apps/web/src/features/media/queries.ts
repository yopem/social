import { mutationOptions, queryOptions } from "@tanstack/react-query"

import { uploadMedia } from "rpc/client"

import { execute, workspaceQuery } from "@/lib/queries"

export function mediaQuery({
  workspaceId,
  mediaIds,
}: {
  workspaceId: string
  mediaIds: readonly string[]
}) {
  return queryOptions({
    ...workspaceQuery(
      workspaceId,
      "media",
      (rpc) => rpc.MediaList({ workspaceId, mediaIds }),
      mediaIds.join(","),
    ),
    enabled: mediaIds.length > 0,
  })
}

export function uploadMediaMutation(workspaceId: string) {
  return mutationOptions({
    mutationFn: (file: File) => execute(uploadMedia(workspaceId, file)),
    retry: false,
  })
}
