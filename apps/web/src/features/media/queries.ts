import { mutationOptions } from "@tanstack/react-query"

import { uploadMedia } from "rpc/client"

import { execute } from "@/lib/queries"

export function mediaMutation(workspaceId: string) {
  return mutationOptions({
    mutationFn: (file: File) => execute(uploadMedia(workspaceId, file)),
    retry: false,
  })
}
