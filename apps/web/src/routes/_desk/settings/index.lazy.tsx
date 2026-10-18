import { createLazyFileRoute } from "@tanstack/react-router"

import { Box } from "ui/components/box"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { AccountDeletionSettings } from "@/features/accounts/components/account-deletion-settings"
import { WorkspaceMembers } from "@/features/workspaces/components/workspace-members"

export const Route = createLazyFileRoute("/_desk/settings/")({
  component: SettingsPage,
})

export function SettingsPage() {
  const workspace = useDeskWorkspace()

  return (
    <Stack>
      <PageHeading title="Workspace settings" />
      <Box render={<dl />}>
        <Box render={<dt />}>Name</Box>
        <Box render={<dd />}>{workspace.name}</Box>
        <Box render={<dt />}>Type</Box>
        <Box render={<dd />}>{workspace.kind}</Box>
        <Box render={<dt />}>Timezone</Box>
        <Box render={<dd />}>{workspace.timezone}</Box>
        <Box render={<dt />}>Your role</Box>
        <Box render={<dd />}>{workspace.role}</Box>
      </Box>
      {workspace.role !== "editor" ? (
        <WorkspaceMembers
          workspaceId={workspace.id}
          canTransfer={workspace.role === "owner"}
        />
      ) : (
        <Text>Only owners and admins can manage workspace members.</Text>
      )}
      <AccountDeletionSettings />
    </Stack>
  )
}
