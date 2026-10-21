import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import type { Post } from "rpc/contracts/posts"

export function usePostEditor() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [post, setPost] = useState<Post>()
  const [reviewOutcome, setReviewOutcome] = useState<Post | null>(null)

  function createPost() {
    void navigate({
      to: "/posts/new",
      search: (previous) => ({ workspace: previous.workspace }),
    })
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
