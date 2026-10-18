import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router"

import { Desk } from "@/components/desk"
import { AccountDeletionSettings } from "@/features/accounts/components/account-deletion-settings"

export const Route = createFileRoute("/_desk")({ component: DeskLayout })

export function DeskLayout() {
  const view = useMatches({
    select: (matches) =>
      matches.findLast((match) => match.staticData.deskView)?.staticData
        .deskView ?? "queue",
  })

  return (
    <Desk
      view={view}
      emptyWorkspace={
        view === "settings" ? <AccountDeletionSettings /> : undefined
      }
    >
      <Outlet />
    </Desk>
  )
}
