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
import { Wrap } from "ui/components/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import { Brand } from "@/components/public-shell"
import { sessionQuery } from "@/features/session/queries"

export const Route = createFileRoute("/sign-in/")({
  head: () => ({ meta: [{ title: "Sign in | Yopem Social" }] }),
  component: SignInPage,
})

const styles = stylex.create({
  header: { margin: `calc(${tokens["--spacing"]} * 6)` },
  back: { marginInlineStart: "auto" },
  main: { marginInline: `calc(${tokens["--spacing"]} * 4)` },
  center: { blockSize: "max(32rem, calc(100svh - 8rem))" },
  panel: { inlineSize: "min(100%, 26rem)" },
  legalLink: { textDecoration: "underline", outlineOffset: 4 },
})

export function SignInPage() {
  const session = useQuery(sessionQuery())
  const signedIn = Boolean(session.data?.user)

  return (
    <Stack>
      <Box render={<header />} xstyle={styles.header}>
        <Wrap>
          <Brand />
          <Button xstyle={styles.back} variant="ghost" render={<Link to="/" />}>
            <ArrowLeftIcon size={16} aria-hidden="true" />
            Back to home
          </Button>
        </Wrap>
      </Box>
      <Box render={<main />} xstyle={styles.main}>
        <Center xstyle={styles.center}>
          <Stack xstyle={styles.panel}>
            <Card>
              <CardHeader>
                <Heading
                  render={
                    <h1>{signedIn ? "You’re signed in" : "Welcome back"}</h1>
                  }
                />
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
                      render={
                        <Link
                          from={Route.fullPath}
                          href="/auth/login?returnTo=%2Fqueue"
                          reloadDocument
                          aria-label="Continue with Google"
                        />
                      }
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
