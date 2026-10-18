import * as stylex from "@stylexjs/stylex"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { ChevronsUpDownIcon, LogOutIcon, UserRoundIcon } from "lucide-react"

import type { User } from "rpc/contracts/accounts"
import { HStack } from "ui/components/hstack"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
  menuSlotStyles,
} from "ui/components/menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuText,
  sidebarSlotStyles,
} from "ui/components/sidebar"

import { Failure } from "@/components/desk-ui"
import { logoutMutation } from "@/features/session/queries"

const styles = stylex.create({
  popup: { width: "min(18rem, calc(100vw - 2rem))" },
  chevron: { marginInlineStart: "auto" },
})

export function UserMenu({ user }: { user: User }) {
  const client = useQueryClient()
  const signOut = useMutation(logoutMutation(client))

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            aria-label="User menu"
            disabled={signOut.isPending}
            render={<SidebarMenuButton size="lg" />}
          >
            <UserRoundIcon
              aria-hidden="true"
              {...stylex.props(sidebarSlotStyles.icon)}
            />
            <SidebarMenuText>{user.name}</SidebarMenuText>
            <ChevronsUpDownIcon
              aria-hidden="true"
              {...stylex.props(sidebarSlotStyles.icon, styles.chevron)}
            />
          </MenuTrigger>
          <MenuPopup
            aria-label="User menu"
            side="top"
            align="start"
            xstyle={styles.popup}
          >
            <MenuGroup>
              <MenuGroupLabel render={<HStack />}>
                <SidebarMenuText>{user.name}</SidebarMenuText>
              </MenuGroupLabel>
              <MenuSeparator />
              <MenuItem
                disabled={signOut.isPending}
                aria-busy={signOut.isPending || undefined}
                closeOnClick={false}
                onClick={() =>
                  signOut.mutate(undefined, {
                    onSuccess: () => window.location.assign("/"),
                  })
                }
              >
                <LogOutIcon
                  aria-hidden="true"
                  {...stylex.props(menuSlotStyles.icon)}
                />
                {signOut.isPending ? "Signing out…" : "Sign out"}
              </MenuItem>
              <Failure error={signOut.error} />
            </MenuGroup>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
