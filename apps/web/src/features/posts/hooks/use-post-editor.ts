import { useState } from "react"

import type { Post } from "rpc/contracts/posts"

export function usePostEditor() {
  const [open, setOpen] = useState(false)
  const [post, setPost] = useState<Post>()
  const [reviewOutcome, setReviewOutcome] = useState<Post | null>(null)

  function createPost() {
    setOpen(true)
  }

  function editPost(selected: Post) {
    setPost(selected)
    setOpen(true)
  }

  function closeEditor(result?: Post | null) {
    if (result)
      setReviewOutcome(result.state === "needs-review" ? result : null)

    setOpen(false)
    setPost(undefined)
  }

  return { open, post, reviewOutcome, createPost, editPost, closeEditor }
}
