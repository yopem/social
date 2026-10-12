import * as stylex from "@stylexjs/stylex"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useSearch } from "@tanstack/react-router"
import { useState } from "react"

import { ApiError, type Workspace } from "rpc/contracts/models"
import { Button } from "ui/components/ui/button"
import { tokens } from "ui/styles/tokens.stylex"

import { Failure } from "../../../components/desk-ui"
import { sessionQuery, logoutMutation } from "../queries"
import { Analytics } from "./analytics"
import { Channels } from "./channels"
import { Feeds } from "./feeds"
import { Posts } from "./posts"
import { Settings } from "./settings"
import { Workspaces } from "./workspaces"

const styles = stylex.create({
  shell: {
    display: "grid",
    gridTemplateColumns: {
      default: "228px minmax(0, 1fr)",
      "@media (max-width: 700px)": "minmax(0, 1fr)",
    },
    minHeight: "100vh",
  },
  sidebar: {
    backgroundColor: tokens["--sidebar"],
    borderRight: `1px solid ${tokens["--border"]}`,
    padding: 20,
    display: "flex",
    flexDirection: "column",
    gap: 24,
    minWidth: 0,
  },
  brand: { fontWeight: 650, fontSize: 18, letterSpacing: "-0.02em" },
  nav: {
    display: { default: "grid", "@media (max-width: 700px)": "flex" },
    flexWrap: "wrap",
    gap: 6,
  },
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
  main: {
    padding: { default: 36, "@media (max-width: 700px)": 18 },
    minWidth: 0,
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
  login: {
    maxWidth: 540,
    margin: "10vh auto",
    padding: 24,
    display: "grid",
    gap: 20,
  },
  mobile: {
    display: { default: "none", "@media (max-width: 700px)": "inline-flex" },
  },
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
  const [menuOpen, setMenuOpen] = useState(false)
  const workspace =
    session.data?.workspaces.find((item) => item.id === search.workspace) ??
    session.data?.workspaces[0]
  const unauthorized =
    session.error instanceof ApiError &&
    session.error.code === "unauthenticated"
  if (session.isPending)
    return (
      <main {...stylex.props(styles.login)} aria-busy="true">
        <h1>Publishing desk</h1>
        <p role="status">Loading your workspace…</p>
      </main>
    )
  if (!session.data)
    return (
      <main {...stylex.props(styles.login)}>
        <h1>Publishing desk</h1>
        {unauthorized ? (
          <p>Sign in to manage your publishing workspace.</p>
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
        <Button render={<a href="/auth/login" />}>Sign in with Google</Button>
      </main>
    )
  return (
    <>
      <a href="#main-content" {...stylex.props(styles.skip)}>
        Skip to content
      </a>
      <div {...stylex.props(styles.shell)}>
        <aside {...stylex.props(styles.sidebar)}>
          <p {...stylex.props(styles.brand)}>Publishing desk</p>
          <Workspaces
            workspaces={session.data.workspaces}
            selected={workspace}
            onSelect={(id) => {
              void navigate({ search: { workspace: id }, replace: true })
            }}
          />
          <Button
            variant="outline"
            xstyle={styles.mobile}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            Navigation
          </Button>
          <nav aria-label="Publishing" {...stylex.props(styles.nav)}>
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
          </nav>
          <p>{session.data.user.name}</p>
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
        </aside>
        <main id="main-content" tabIndex={-1} {...stylex.props(styles.main)}>
          {workspace ? (
            <WorkspaceView
              key={workspace.id}
              workspace={workspace}
              view={view}
              attempt={search.attempt}
            />
          ) : (
            <p>Create a workspace to start publishing.</p>
          )}
        </main>
      </div>
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
