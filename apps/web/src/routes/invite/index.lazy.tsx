import * as stylex from "@stylexjs/stylex"
import { createLazyFileRoute, Link } from "@tanstack/react-router"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Card, CardHeader, CardPanel, CardFooter } from "ui/components/card"
import { Center } from "ui/components/center"
import { Container } from "ui/components/container"
import { Heading } from "ui/components/heading"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { deskStyles } from "@/components/desk-styles"
import { InviteSession } from "@/features/invites/components/invite-session"

const styles = stylex.create({
  page: { marginBlock: "max(2rem, 10vh)" },
  container: { maxInlineSize: "28rem" },
})

const titleStyles = [deskStyles.heading, deskStyles.title]

const errorStyles = [deskStyles.text, deskStyles.danger]

export const Route = createLazyFileRoute("/invite/")({
  component: InvitePage,
})

export function InvitePage() {
  const { token } = Route.useSearch()

  return (
    <Box render={<main />} xstyle={styles.page}>
      <Center>
        <Container xstyle={styles.container}>
          <Card>
            <CardHeader>
              <Heading
                render={<h1>Workspace invitation</h1>}
                xstyle={titleStyles}
              />
            </CardHeader>
            <CardPanel>
              <Stack>
                {token ? (
                  <InviteSession key={token} token={token} />
                ) : (
                  <Text role="alert" xstyle={errorStyles}>
                    Invalid invitation link. Ask the workspace owner for a new
                    link.
                  </Text>
                )}
              </Stack>
            </CardPanel>
            <CardFooter>
              <Button variant="link" render={<Link to="/queue" />}>
                Back to publishing desk
              </Button>
            </CardFooter>
          </Card>
        </Container>
      </Center>
    </Box>
  )
}
