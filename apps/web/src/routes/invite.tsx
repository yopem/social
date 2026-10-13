import { createFileRoute } from "@tanstack/react-router"

import { InvitePage } from "@/features/invites/components/invite-page"
import { inviteSearch } from "@/features/invites/schema"

export const Route = createFileRoute("/invite")({
  validateSearch: inviteSearch,
  head: () => ({
    meta: [
      { title: "Workspace invitation · Publishing desk" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: Page,
})

export function Page() {
  const { token } = Route.useSearch()

  return <InvitePage key={token} token={token} />
}
