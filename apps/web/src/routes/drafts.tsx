import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/components/desk"

export const Route = createFileRoute("/drafts")({ component: Page })

export function Page() {
  return <Desk view="drafts" />
}
