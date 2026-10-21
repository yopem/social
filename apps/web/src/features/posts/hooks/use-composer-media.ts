import { useMutation, useQuery } from "@tanstack/react-query"
import { Effect, HashSet } from "effect"
import { useRef, useState } from "react"

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
  const busy = useRef(false)
  const [uploading, setUploading] = useState(false)
  const [activeFile, setActiveFile] = useState("")
  const [uploadErrors, setUploadErrors] = useState<readonly string[]>([])
  const removedIds = HashSet.fromIterable(removed)

  const media = [...(saved.data ?? []), ...uploaded].filter(
    (item) => !HashSet.has(removedIds, item.id),
  )

  const needsSavedMedia =
    post?.content.mediaIds.some((id) => !HashSet.has(removedIds, id)) === true

  async function uploadFiles(
    files: readonly File[],
    onUploaded: (media: Media) => void,
  ) {
    if (busy.current) return
    busy.current = true
    setUploading(true)
    setUploadErrors([])
    const errors: string[] = []

    const acceptedTypes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ]

    let count = media.length

    try {
      await Effect.runPromise(
        Effect.forEach(
          files,
          (file) =>
            Effect.suspend(() => {
              const limit = file.type.startsWith("image/")
                ? 10000000
                : 100000000

              if (!acceptedTypes.includes(file.type)) {
                errors.push(
                  `${file.name}: Use JPEG, PNG, GIF, WebP, MP4, MOV, or WebM.`,
                )
              } else if (file.size === 0 || file.size > limit) {
                errors.push(
                  `${file.name}: Use a non-empty file under ${limit / 1000000} MB.`,
                )
              } else if (count >= 20) {
                errors.push(
                  `${file.name}: A post can have up to 20 attachments.`,
                )
              } else {
                setActiveFile(file.name)

                return Effect.tryPromise({
                  try: async () => {
                    const item = await upload.mutateAsync(file)
                    setUploaded((items) => [...items, item])
                    onUploaded(item)
                    count += 1
                  },
                  catch: (error) =>
                    `${file.name}: ${error instanceof Error ? error.message : "Upload failed. Select the file again to retry."}`,
                }).pipe(
                  Effect.catch((message) =>
                    Effect.sync(() => {
                      errors.push(message)
                    }),
                  ),
                )
              }

              return Effect.void
            }),
          // One upload at a time limits memory use and keeps attachment order.
          { concurrency: 1, discard: true },
        ),
      )
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : "Upload stopped. Choose the remaining files again.",
      )
    }

    setUploadErrors([...new Set(errors)])
    setActiveFile("")
    setUploading(false)
    busy.current = false
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
    uploadErrors,
    activeFile,
    uploading,
    uploadFiles,
    removeMedia,
    retryMedia,
  }
}
