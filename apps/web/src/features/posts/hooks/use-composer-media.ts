import { useMutation, useQuery } from "@tanstack/react-query"
import { HashSet } from "effect"
import { useState } from "react"

import type { Media } from "rpc/contracts/media"
import type { Post } from "rpc/contracts/posts"

import { mediaQuery, uploadMediaMutation } from "@/features/media/queries"

export function useComposerMedia(workspaceId: string, post?: Post) {
  const saved = useQuery(
    mediaQuery({ workspaceId, mediaIds: post?.content.mediaIds ?? [] }),
  )

  const upload = useMutation(uploadMediaMutation(workspaceId))
  const [uploaded, setUploaded] = useState<readonly Media[]>([])
  const [removed, setRemoved] = useState<readonly string[]>([])
  const removedIds = HashSet.fromIterable(removed)

  const media = [...(saved.data ?? []), ...uploaded].filter(
    (item) => !HashSet.has(removedIds, item.id),
  )

  const needsSavedMedia =
    post?.content.mediaIds.some((id) => !HashSet.has(removedIds, id)) === true

  function uploadFile(file: File, onUploaded: (media: Media) => void) {
    upload.mutate(file, {
      onSuccess: (item) => {
        setUploaded((items) => [...items, item])
        onUploaded(item)
      },
    })
  }

  function removeMedia(id: string) {
    setRemoved((ids) => [...ids, id])
  }

  function retryMedia() {
    void saved.refetch()
  }

  return {
    media,
    unavailableIds: saved.isError
      ? (post?.content.mediaIds.filter((id) => !HashSet.has(removedIds, id)) ??
        [])
      : [],
    error: saved.error,
    failed: saved.isError,
    loading: needsSavedMedia && saved.isPending,
    unavailable: needsSavedMedia && (saved.isPending || saved.isError),
    uploadError: upload.error,
    uploading: upload.isPending,
    uploadFile,
    removeMedia,
    retryMedia,
  }
}
