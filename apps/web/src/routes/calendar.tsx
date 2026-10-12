import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/features/desk/components/desk"

export const Route = createFileRoute("/calendar")({ component: Page })

export function Page() {
  return <Desk view="calendar" />
}
