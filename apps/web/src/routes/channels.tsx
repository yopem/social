import { createFileRoute } from "@tanstack/react-router"

import { Desk } from "@/features/desk/components/desk"

export const Route = createFileRoute("/channels")({ component: Page })

export function Page() {
  return <Desk view="channels" />
}
