import * as stylex from "@stylexjs/stylex"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"

import type { Workspace } from "rpc/contracts/models"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Flex } from "ui/components/ui/flex"
import { Heading } from "ui/components/ui/heading"
import { Stack } from "ui/components/ui/stack"
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
  link: {
    padding: "10px 12px",
    borderRadius: 6,
    textDecoration: "none",
    color: tokens["--foreground"],
    fontSize: 14,
    backgroundColor: {
      default: "transparent",
      ":hover": tokens["--accent"],
      '[aria-current="page"]': tokens["--accent"],
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
  login: { width: "min(540px, 100%)", margin: "10vh auto" },
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
  { to: "/", label: "Queue" },
  { to: "/drafts", label: "Drafts" },
  { to: "/calendar", label: "Calendar" },
  { to: "/channels", label: "Channels" },
  { to: "/rss", label: "RSS automation" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Settings" },
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
      <Box
        render={<Stack render={<main />} spacing="loose" />}
        padding="spacious"
        xstyle={styles.login}
        aria-busy="true"
      >
        <Heading render={<h1>Publishing desk</h1>} />
        <Box render={<output />}>Loading your workspace…</Box>
      </Box>
    )

  if (!session.data?.user)
    return (
      <Box
        render={<Stack render={<main />} spacing="loose" />}
        padding="spacious"
        xstyle={styles.login}
      >
        <Heading render={<h1>Publishing desk</h1>} />
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
        <Box
          render={<Stack render={<aside />} spacing="loose" />}
          surface="sidebar"
          padding="comfortable"
        >
          <Text size="large" weight="semibold">
            Publishing desk
          </Text>
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
          <Flex
            render={<nav />}
            aria-label="Publishing"
            spacing="tight"
            wrap
            direction="responsive"
          >
            {navigation.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                search={{ workspace: workspace?.id }}
                activeOptions={{ exact: true }}
                {...stylex.props(styles.link)}
              >
                {item.label}
              </Link>
            ))}
          </Flex>
          <Text>{session.data.user.name}</Text>
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
        <Box
          render={<main />}
          id="main-content"
          tabIndex={-1}
          padding="responsive"
        >
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
