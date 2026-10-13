import * as stylex from "@stylexjs/stylex"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import {
  CalendarDaysIcon,
  ChartNoAxesCombinedIcon,
  FileTextIcon,
  LayersIcon,
  ListOrderedIcon,
  RadioIcon,
  RssIcon,
  SettingsIcon,
} from "lucide-react"

import type { Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Flex } from "ui/components/ui/flex"
import { Heading } from "ui/components/ui/heading"
import { Text } from "ui/components/ui/text"
import { tokens } from "ui/styles/tokens.stylex"

import { Failure } from "@/components/desk-ui"
import { sessionQuery, logoutMutation } from "@/features/desk/queries"
import { LegalLinks } from "@/features/legal/components/legal-page"

import { Analytics } from "./analytics"
import { Channels } from "./channels"
import { Feeds } from "./feeds"
import { Posts } from "./posts"
import { AccountDeletionSettings, Settings } from "./settings"
import { Workspaces } from "./workspaces"

const styles = stylex.create({
  brandIcon: { color: tokens["--primary"], flexShrink: 0 },
  link: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    padding: "10px 12px",
    fontWeight: 500,
    borderRadius: 6,
    textDecoration: "none",
    color: {
      default: tokens["--foreground"],
      '[aria-current="page"]': tokens["--sidebar-accent-foreground"],
    },
    fontSize: 14,
    backgroundColor: {
      default: "transparent",
      ":hover": tokens["--accent"],
      '[aria-current="page"]': tokens["--sidebar-accent"],
    },
    ":focus-visible": {
      outline: `2px solid ${tokens["--ring"]}`,
      outlineOffset: 2,
    },
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
  context: { marginBlockEnd: 24 },
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
  { to: "/", label: "Queue", icon: ListOrderedIcon },
  { to: "/drafts", label: "Drafts", icon: FileTextIcon },
  { to: "/calendar", label: "Calendar", icon: CalendarDaysIcon },
  { to: "/channels", label: "Channels", icon: RadioIcon },
  { to: "/rss", label: "RSS automation", icon: RssIcon },
  { to: "/analytics", label: "Analytics", icon: ChartNoAxesCombinedIcon },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const

export function Desk({ view }: { view: DeskView }) {
  const session = useQuery(sessionQuery())
  const search = useSearch({ from: "__root__" })
  const navigate = useNavigate()
  const client = useQueryClient()
  const signOut = useMutation(logoutMutation(client))

  const workspace =
    session.data?.workspaces.find((item) => item.id === search.workspace) ??
    session.data?.workspaces[0]

  if (session.isPending)
    return (
      <Box render={<main />} region="panel" aria-busy="true">
        <Heading render={<h1>Publishing desk</h1>} size="title" />
        <Box render={<output />} aria-live="polite">
          Loading your workspace…
        </Box>
      </Box>
    )

  if (!session.data?.user)
    return (
      <Box render={<main />} region="panel">
        <Heading render={<h1>Publishing desk</h1>} size="title" />
        {session.isSuccess && session.data.user === null ? (
          <>
            <Text>Sign in to manage your publishing workspace.</Text>
            <Button
              render={<a href="/auth/login" aria-label="Sign in with Google" />}
            >
              Sign in with Google
            </Button>
            <Text tone="muted" size="small">
              By signing in, you agree to our Terms of Service and acknowledge
              our Privacy Policy.
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
        <LegalLinks />
      </Box>
    )

  return (
    <>
      <a href="#main-content" {...stylex.props(styles.skip)}>
        Skip to content
      </a>
      <Box layout="split">
        <Box render={<aside />} region="sidebar">
          <Flex align="center" spacing="normal">
            <LayersIcon
              size={22}
              aria-hidden="true"
              {...stylex.props(styles.brandIcon)}
            />
            <Text size="large" weight="semibold">
              Publishing desk
            </Text>
          </Flex>
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
          <Box render={<nav />} region="navigation" aria-label="Publishing">
            {navigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                search={{ workspace: workspace?.id }}
                activeOptions={{ exact: true }}
                {...stylex.props(styles.link)}
              >
                <item.icon size={18} aria-hidden="true" />
                {item.label}
              </Link>
            ))}
          </Box>
          <Box render={<footer />} region="footer">
            <Text size="small" weight="semibold">
              {session.data.user.name}
            </Text>
            <Failure error={signOut.error} />
            <Button
              variant="ghost"
              loading={signOut.isPending}
              onClick={() =>
                signOut.mutate(undefined, {
                  onSuccess: () => {
                    window.location.assign("/")
                  },
                })
              }
            >
              Sign out
            </Button>
            <LegalLinks />
          </Box>
        </Box>
        <Box render={<main />} region="content" id="main-content" tabIndex={-1}>
          <Text tone="muted" size="small" xstyle={styles.context}>
            {workspace?.name ?? "Your account"} / Publishing
          </Text>
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
            <Text>Create a workspace to start publishing.</Text>
          )}
        </Box>
      </Box>
    </>
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
