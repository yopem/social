import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/components/desk"

export const Route = createFileRoute("/analytics")({ component: Page })

export function Page() {
  return <Desk view="analytics" />
}
