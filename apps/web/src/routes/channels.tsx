import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/components/desk"

export const Route = createFileRoute("/channels")({ component: Page })

export function Page() {
  return <Desk view="channels" />
}
