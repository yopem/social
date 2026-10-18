import * as stylex from "@stylexjs/stylex"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeftIcon, LockKeyholeIcon, LogInIcon } from "lucide-react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
} from "ui/components/card"
import { Center } from "ui/components/center"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { tokens } from "ui/styles/tokens.stylex"

import { Brand } from "@/components/public-shell"
import { sessionQuery } from "@/features/session/queries"

export const Route = createFileRoute("/sign-in/")({
  head: () => ({ meta: [{ title: "Sign in | Yopem Social" }] }),
  component: SignInPage,
})

const styles = stylex.create({
  page: { minBlockSize: "100svh" },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: `calc(${tokens["--spacing"]} * 4)`,
    padding: `calc(${tokens["--spacing"]} * 6)`,
  },
  main: {
    display: "grid",
    alignItems: "center",
    flex: 1,
    paddingInline: `calc(${tokens["--spacing"]} * 4)`,
    paddingBlock: `calc(${tokens["--spacing"]} * 10)`,
  },
  panel: { inlineSize: "100%", maxInlineSize: "26rem" },
  legalLink: { textDecoration: "underline", outlineOffset: 4 },
})

export function SignInPage() {
  const session = useQuery(sessionQuery())
  const signedIn = Boolean(session.data?.user)

  return (
    <Stack xstyle={styles.page}>
      <Box render={<header />} xstyle={styles.header}>
        <Brand />
        <Button variant="ghost" render={<Link to="/" />}>
          <ArrowLeftIcon size={16} aria-hidden="true" />
          Back to home
        </Button>
      </Box>
      <Box render={<main />} xstyle={styles.main}>
        <Center>
          <Stack xstyle={styles.panel}>
            <Card>
              <CardHeader>
                <Heading render={<h1 />}>
                  {signedIn ? "You’re signed in" : "Welcome back"}
                </Heading>
                <CardDescription>
                  {signedIn
                    ? "Your publishing workspace is ready."
                    : "Sign in to your Yopem Social workspace."}
                </CardDescription>
              </CardHeader>
              <CardPanel>
                <Stack>
                  {signedIn ? (
                    <Button size="lg" render={<Link to="/queue" search={{}} />}>
                      Continue to workspace
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      render={<a href="/auth/login?returnTo=%2Fqueue" />}
                    >
                      <LogInIcon size={18} aria-hidden="true" />
                      Continue with Google
                    </Button>
                  )}
                  {session.isError && (
                    <Stack>
                      <Text role="alert">
                        We could not check your session. Try again, or continue
                        with Google to sign in.
                      </Text>
                      <Button
                        variant="outline"
                        onClick={() => void session.refetch()}
                      >
                        Check session again
                      </Button>
                    </Stack>
                  )}
                  {!signedIn && (
                    <HStack>
                      <LockKeyholeIcon size={16} aria-hidden="true" />
                      <CardDescription>
                        You will sign in securely with Yopem, then return here.
                      </CardDescription>
                    </HStack>
                  )}
                </Stack>
              </CardPanel>
            </Card>
            {!signedIn && (
              <CardDescription>
                By continuing, you agree to our{" "}
                <Link to="/tos" {...stylex.props(styles.legalLink)}>
                  Terms of Service
                </Link>{" "}
                and acknowledge our{" "}
                <Link to="/privacy-policy" {...stylex.props(styles.legalLink)}>
                  Privacy Policy
                </Link>
                .
              </CardDescription>
            )}
          </Stack>
        </Center>
      </Box>
    </Stack>
  )
}
