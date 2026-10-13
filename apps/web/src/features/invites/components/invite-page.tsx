import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"

import { withRpc } from "rpc/client"
import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Heading } from "ui/components/ui/heading"
import { Text } from "ui/components/ui/text"

import { Failure } from "@/components/desk-ui"
import { errorMessage, execute, sessionQuery } from "@/features/desk/queries"

export function InvitePage({ token }: { token?: string }) {
  return (
    <Box render={<main />} region="panel">
      <Heading render={<h1>Workspace invitation</h1>} size="title" />
      {token ? (
        <InviteSession token={token} />
      ) : (
        <Text role="alert" tone="danger">
          Invalid invitation link. Ask the workspace owner for a new link.
        </Text>
      )}
      <Button variant="link" render={<Link to="/" />}>
        Back to publishing desk
      </Button>
    </Box>
  )
}

export function InviteSession({ token }: { token: string }) {
  const session = useQuery(sessionQuery())
  const client = useQueryClient()
  const navigate = useNavigate()

  const accept = useMutation({
    mutationFn: () =>
      execute(withRpc((rpc) => rpc.WorkspaceAcceptInvite({ token }))),
    retry: false,
    onSuccess: async (workspace) => {
      await client.invalidateQueries({ queryKey: ["session"] })
      await navigate({ to: "/", search: { workspace: workspace.id } })
    },
  })

  function retrySession() {
    void session.refetch()
  }

  function acceptInvitation() {
    accept.mutate()
  }

  if (session.isPending)
    return (
      <Box render={<output />} aria-live="polite" aria-busy="true">
        Loading your session…
      </Box>
    )

  if (session.isError)
    return (
      <>
        <Failure error={session.error} />
        <Button loading={session.isFetching} onClick={retrySession}>
          Retry
        </Button>
      </>
    )

  if (!session.data.user)
    return (
      <>
        <Text>
          Sign in with the email address that received this invitation.
        </Text>
        <Button
          render={
            <a
              aria-label="Sign in with Google"
              href={`/auth/login?returnTo=${encodeURIComponent(`/invite?token=${token}`)}`}
            />
          }
        >
          Sign in with Google
        </Button>
      </>
    )

  return (
    <>
      <Text>Signed in as {session.data.user.email}.</Text>
      <Text>Accept this invitation to join the workspace.</Text>
      {accept.isError && (
        <Text role="alert" tone="danger">
          {errorMessage(accept.error)}. This invitation may be expired, already
          used, or intended for another email. Check your signed-in email or ask
          the workspace owner for a new link.
        </Text>
      )}
      <Button
        loading={accept.isPending}
        disabled={accept.isSuccess}
        onClick={acceptInvitation}
      >
        Accept invitation
      </Button>
    </>
  )
}
