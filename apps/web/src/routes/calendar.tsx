import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/components/desk"

export const Route = createFileRoute("/calendar")({ component: Page })

export function Page() {
  return <Desk view="calendar" />
}
