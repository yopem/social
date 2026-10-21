import type { ReactNode } from "react"

import * as stylex from "@stylexjs/stylex"
import { useQuery, type UseQueryResult } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import {
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  ChevronRightIcon,
  FileTextIcon,
  LayersIcon,
  ListOrderedIcon,
  RadioIcon,
  RssIcon,
  SettingsIcon,
} from "lucide-react"

import type { PublicSession } from "rpc/contracts/session"
import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Container } from "ui/components/container"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "ui/components/empty"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Separator } from "ui/components/separator"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuText,
  SidebarProvider,
  SidebarSeparator,
  SidebarTrigger,
  sidebarSlotStyles,
  useSidebar,
} from "ui/components/sidebar"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Wrap } from "ui/components/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"
import { DeskWorkspaceContext } from "@/components/desk-workspace"
import { PublicShell, publicStyles } from "@/components/public-shell"
import { WorkspaceLoading } from "@/components/workspace-loading"
import { UserMenu } from "@/features/session/components/user-menu"
import { sessionQuery } from "@/features/session/queries"
import { Workspaces } from "@/features/workspaces/components/workspaces"

const styles = stylex.create({
  brandIcon: {
    color: tokens["--primary-foreground"],
    backgroundColor: tokens["--primary"],
    borderRadius: tokens["--radius-md"],
    padding: 7,
    flexShrink: 0,
  },
  skip: {
    position: "fixed",
    top: 8,
    left: 8,
    zIndex: 100,
    padding: 12,
    backgroundColor: tokens["--background"],
    color: tokens["--foreground"],
    transform: { default: "translateY(-200%)", ":focus": "translateY(0)" },
  },
  header: {
    marginBlock: `calc(${tokens["--spacing"]} * 3)`,
    marginInline: `calc(${tokens["--spacing"]} * 4)`,
  },
  headerDivider: { height: 16 },
  contextIcon: { color: tokens["--muted-foreground"], flexShrink: 0 },
})

export type DeskView =
  | "queue"
  | "drafts"
  | "calendar"
  | "channels"
  | "rss"
  | "analytics"
  | "settings"

const navigation = [
  {
    to: "/queue",
    view: "queue",
    label: "Queue",
    icon: ListOrderedIcon,
    group: "Publishing",
  },
  {
    to: "/drafts",
    view: "drafts",
    label: "Drafts",
    icon: FileTextIcon,
    group: "Publishing",
  },
  {
    to: "/calendar",
    view: "calendar",
    label: "Calendar",
    icon: CalendarDaysIcon,
    group: "Publishing",
  },
  {
    to: "/channels",
    view: "channels",
    label: "Channels",
    icon: RadioIcon,
    group: "Workspace",
  },
  {
    to: "/rss",
    view: "rss",
    label: "RSS automation",
    icon: RssIcon,
    group: "Workspace",
  },
  {
    to: "/analytics",
    view: "analytics",
    label: "Analytics",
    icon: ChartNoAxesCombinedIcon,
    group: "Workspace",
  },
  {
    to: "/settings",
    view: "settings",
    label: "Settings",
    icon: SettingsIcon,
    group: "Workspace",
  },
] as const

export function DeskAccess({
  session,
}: {
  session: UseQueryResult<PublicSession>
}) {
  if (session.isPending) return <WorkspaceLoading />

  return (
    <PublicShell>
      <Box render={<main />} xstyle={publicStyles.hero}>
        <Stack>
          <Heading
            render={
              <h1>
                {session.isError
                  ? "Let’s try that again."
                  : "Your workspace is waiting."}
              </h1>
            }
            xstyle={publicStyles.title}
          />
          <Text role={session.isError ? "alert" : undefined}>
            {session.isError
              ? "We could not open your workspace. Check your connection and try again."
              : "Sign in to see your drafts, plan your week, and publish your next post."}
          </Text>
          <Wrap>
            {session.isError && (
              <Button onClick={() => void session.refetch()}>Try again</Button>
            )}
            <Button
              variant={session.isError ? "outline" : "default"}
              render={<Link to="/sign-in" />}
            >
              Sign in
            </Button>
          </Wrap>
        </Stack>
      </Box>
    </PublicShell>
  )
}

export function Desk({
  view,
  children,
  emptyWorkspace,
}: {
  view: DeskView
  children: ReactNode
  emptyWorkspace?: ReactNode
}) {
  const session = useQuery(sessionQuery())
  const search = useSearch({ from: "__root__" })
  const navigate = useNavigate()

  const workspace =
    session.data?.workspaces.find((item) => item.id === search.workspace) ??
    session.data?.workspaces[0]

  if (session.isPending || !session.data?.user)
    return <DeskAccess session={session} />

  return (
    <>
      <a href="#main-content" {...stylex.props(styles.skip)}>
        Skip to content
      </a>
      <SidebarProvider>
        <Sidebar>
          <SidebarHeader>
            <HStack>
              <LayersIcon
                size={34}
                aria-hidden="true"
                {...stylex.props(styles.brandIcon)}
              />
              <Text>Publishing desk</Text>
            </HStack>
            <Workspaces
              workspaces={session.data.workspaces}
              selected={workspace}
              onSelect={(id) => {
                void navigate({
                  to: ".",
                  search: { workspace: id },
                  replace: true,
                })
              }}
            />
          </SidebarHeader>
          <SidebarSeparator />
          <SidebarContent>
            <DeskNavigation view={view} workspaceId={workspace?.id} />
          </SidebarContent>
          <SidebarFooter>
            <Separator />
            <UserMenu user={session.data.user} />
          </SidebarFooter>
        </Sidebar>
        <SidebarInset id="main-content" tabIndex={-1}>
          <Box render={<header />} xstyle={styles.header}>
            <Wrap>
              <SidebarTrigger />
              <Separator orientation="vertical" xstyle={styles.headerDivider} />
              <Text>{workspace?.name ?? "Your account"}</Text>
              <ChevronRightIcon
                size={14}
                aria-hidden="true"
                {...stylex.props(styles.contextIcon)}
              />
              <Text>
                {navigation.find((item) => item.view === view)?.label}
              </Text>
            </Wrap>
          </Box>
          <Box render={<section />} xstyle={deskStyles.content}>
            <Container>
              <Failure error={session.error} />
              {session.isError && (
                <Button
                  onClick={() => {
                    void session.refetch()
                  }}
                >
                  Retry
                </Button>
              )}
              {workspace ? (
                <DeskWorkspaceContext key={workspace.id} value={workspace}>
                  {children}
                </DeskWorkspaceContext>
              ) : (
                (emptyWorkspace ?? (
                  <Empty>
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <LayersIcon aria-hidden="true" />
                      </EmptyMedia>
                      <EmptyTitle>Create a workspace</EmptyTitle>
                      <EmptyDescription>
                        Create a workspace to start publishing.
                      </EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                ))
              )}
            </Container>
          </Box>
        </SidebarInset>
      </SidebarProvider>
    </>
  )
}

export function DeskNavigation({
  view,
  workspaceId,
}: {
  view: DeskView
  workspaceId?: string
}) {
  const { setOpenMobile } = useSidebar()

  return (
    <Box render={<nav />} aria-label="Publishing">
      {(["Publishing", "Workspace"] as const).map((group) => (
        <SidebarGroup key={group}>
          <SidebarGroupLabel>{group}</SidebarGroupLabel>
          <SidebarMenu>
            {navigation
              .values()
              .filter((item) => item.group === group)
              .map((item) => (
                <SidebarMenuItem key={item.to}>
                  <SidebarMenuButton
                    isActive={view === item.view}
                    render={
                      <Link
                        to={item.to}
                        search={{ workspace: workspaceId }}
                        activeOptions={{ exact: true }}
                        onClick={() => setOpenMobile(false)}
                      />
                    }
                  >
                    <item.icon
                      aria-hidden="true"
                      {...stylex.props(sidebarSlotStyles.icon)}
                    />
                    <SidebarMenuText>{item.label}</SidebarMenuText>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))
              .toArray()}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </Box>
  )
}
