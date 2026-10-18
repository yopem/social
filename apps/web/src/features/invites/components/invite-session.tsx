import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Text } from "ui/components/text"

import { deskStyles } from "@/components/desk-styles"
import { Failure } from "@/components/desk-ui"
import { acceptInvitationMutation } from "@/features/invites/queries"
import { sessionQuery } from "@/features/session/queries"
import { errorMessage } from "@/lib/queries"

const errorStyles = [deskStyles.text, deskStyles.danger]

export function InviteSession({ token }: { token: string }) {
  const session = useQuery(sessionQuery())
  const client = useQueryClient()
  const navigate = useNavigate()

  const acceptance = useMutation(
    acceptInvitationMutation({
      client,
      token,
      onAccepted: (workspace) =>
        navigate({ to: "/", search: { workspace: workspace.id } }),
    }),
  )

  function retrySession() {
    void session.refetch()
  }

  function acceptInvitation() {
    acceptance.mutate()
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
        <Text xstyle={deskStyles.text}>
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
      <Text xstyle={deskStyles.text}>
        Signed in as {session.data.user.email}.
      </Text>
      <Text xstyle={deskStyles.text}>
        Accept this invitation to join the workspace.
      </Text>
      {acceptance.isError && (
        <Text role="alert" xstyle={errorStyles}>
          {errorMessage(acceptance.error)}. This invitation may be expired,
          already used, or intended for another email. Check your signed-in
          email or ask the workspace owner for a new link.
        </Text>
      )}
      <Button
        loading={acceptance.isPending}
        disabled={acceptance.isSuccess}
        onClick={acceptInvitation}
      >
        Accept invitation
      </Button>
    </>
  )
}
