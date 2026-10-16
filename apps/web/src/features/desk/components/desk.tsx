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
  LogInIcon,
  RadioIcon,
  RssIcon,
  SettingsIcon,
} from "lucide-react"

import type { PublicSession, Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Card, CardHeader, CardPanel, CardTitle } from "ui/components/ui/card"
import { Center } from "ui/components/ui/center"
import { Container } from "ui/components/ui/container"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "ui/components/ui/empty"
import { HStack } from "ui/components/ui/hstack"
import { Separator } from "ui/components/ui/separator"
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
} from "ui/components/ui/sidebar"
import { Skeleton } from "ui/components/ui/skeleton"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"
import { Wrap } from "ui/components/ui/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"
import { sessionQuery } from "@/features/desk/queries"
import { LegalLinks } from "@/features/legal/components/legal-page"

import { Analytics } from "./analytics"
import { Channels } from "./channels"
import { Feeds } from "./feeds"
import { Posts } from "./posts"
import { AccountDeletionSettings, Settings } from "./settings"
import { UserMenu } from "./user-menu"
import { Workspaces } from "./workspaces"

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
  authPage: { marginBlock: "max(2rem, 10vh)" },
  authContainer: { maxInlineSize: "28rem" },
  authCard: { width: "100%" },
  skeletonTitle: { height: 20, width: "65%" },
  skeletonLine: { height: 14, width: "90%" },
  skeletonControl: { height: 36, width: "100%" },
  skeletonBody: { height: 100, width: "100%" },
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
    to: "/",
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
  return (
    <Box
      render={<main />}
      aria-busy={session.isPending || undefined}
      xstyle={styles.authPage}
    >
      <Center>
        <Container xstyle={styles.authContainer}>
          <Stack>
            <HStack>
              <LayersIcon
                size={34}
                aria-hidden="true"
                {...stylex.props(styles.brandIcon)}
              />
              <Text>Yopem Social</Text>
            </HStack>
            <Card xstyle={styles.authCard}>
              <CardHeader>
                <CardTitle render={<h1>Publishing desk</h1>} />
                {!session.isPending && session.isSuccess && (
                  <Text>Sign in to manage your publishing workspace.</Text>
                )}
              </CardHeader>
              <CardPanel>
                <Stack>
                  {session.isPending ? (
                    <>
                      <Box render={<output />} aria-live="polite">
                        Loading your workspace…
                      </Box>
                      <Stack aria-hidden="true">
                        <Skeleton xstyle={styles.skeletonTitle} />
                        <Skeleton xstyle={styles.skeletonLine} />
                        <Skeleton xstyle={styles.skeletonBody} />
                        <Skeleton xstyle={styles.skeletonControl} />
                      </Stack>
                    </>
                  ) : session.isSuccess && session.data.user === null ? (
                    <>
                      <Button
                        render={
                          <a
                            href="/auth/login"
                            aria-label="Sign in with Google"
                          />
                        }
                      >
                        <LogInIcon size={16} aria-hidden="true" />
                        Sign in with Google
                      </Button>
                      <Text>
                        By signing in, you agree to our Terms of Service and
                        acknowledge our Privacy Policy.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Failure error={session.error} />
                      <Button
                        onClick={() => {
                          void session.refetch()
                        }}
                      >
                        Retry
                      </Button>
                    </>
                  )}
                </Stack>
              </CardPanel>
            </Card>
            <LegalLinks />
          </Stack>
        </Container>
      </Center>
    </Box>
  )
}

export function Desk({ view }: { view: DeskView }) {
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
                <WorkspaceView
                  key={workspace.id}
                  workspace={workspace}
                  view={view}
                  attempt={search.attempt}
                />
              ) : view === "settings" ? (
                <AccountDeletionSettings />
              ) : (
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

export function WorkspaceView({
  workspace,
  view,
  attempt,
}: {
  workspace: Workspace
  view: DeskView
  attempt?: string
}) {
  if (view === "channels")
    return <Channels workspace={workspace} attempt={attempt} />

  if (view === "analytics") return <Analytics workspaceId={workspace.id} />

  if (view === "rss") return <Feeds workspace={workspace} />

  if (view === "settings") return <Settings workspace={workspace} />

  return <Posts workspace={workspace} view={view} />
}
