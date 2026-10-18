import { createContext, use } from "react"

import type { Workspace } from "rpc/contracts/workspaces"

export const DeskWorkspaceContext = createContext<Workspace | undefined>(
  undefined,
)

export function useDeskWorkspace() {
  const workspace = use(DeskWorkspaceContext)

  if (!workspace) throw new Error("Desk workspace is not available")

  return workspace
}
