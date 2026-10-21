import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_desk/posts/new/")({
  staticData: { deskView: "drafts" },
})
