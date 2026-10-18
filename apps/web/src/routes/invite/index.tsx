import { createFileRoute } from "@tanstack/react-router"

import { inviteSearch } from "@/features/invites/schema"

export const Route = createFileRoute("/invite/")({
  validateSearch: inviteSearch,
  head: () => ({
    meta: [
      { title: "Workspace invitation · Publishing desk" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
})
