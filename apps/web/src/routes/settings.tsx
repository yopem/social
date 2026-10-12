import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/features/desk/components/desk"

export const Route = createFileRoute("/settings")({ component: Page })

export function Page() {
  return <Desk view="settings" />
}
