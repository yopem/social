import * as stylex from "@stylexjs/stylex"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CalendarDaysIcon, FilePenLineIcon, RadioIcon } from "lucide-react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Wrap } from "ui/components/wrap"
import { tokens } from "ui/styles/tokens.stylex"

import { PublicShell, publicStyles } from "@/components/public-shell"
import { PublishingPreview } from "@/features/desk/components/publishing-preview"

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Yopem Social | Your next post starts here" },
      {
        name: "description",
        content:
          "Draft, schedule, and publish social posts from one shared workspace with Yopem Social.",
      },
    ],
  }),
  component: LandingPage,
})

const styles = stylex.create({
  features: {
    display: "grid",
    gridTemplateColumns: {
      default: "repeat(3, minmax(0, 1fr))",
      "@media (max-width: 700px)": "minmax(0, 1fr)",
    },
    gap: `calc(${tokens["--spacing"]} * 10)`,
    paddingBlock: `calc(${tokens["--spacing"]} * 12)`,
  },
})

export function LandingPage() {
  return (
    <PublicShell>
      <Box render={<main />}>
        <Box
          render={<section aria-labelledby="landing-title" />}
          xstyle={publicStyles.hero}
        >
          <Stack xstyle={publicStyles.copy}>
            <Heading
              render={<h1 id="landing-title" />}
              xstyle={publicStyles.title}
            >
              Good ideas deserve to get posted.
            </Heading>
            <Text xstyle={publicStyles.lead}>
              A home for your drafts, a plan for your week, and one place to
              publish across your social channels.
            </Text>
            <Wrap>
              <Button size="lg" render={<Link to="/sign-in" />}>
                Start publishing
              </Button>
              <Button
                size="lg"
                variant="outline"
                render={<a href="#how-it-works" />}
              >
                See how it works
              </Button>
            </Wrap>
            <Text xstyle={publicStyles.note}>
              For the people behind the posts. Work on your own or bring your
              team into a shared workspace.
            </Text>
          </Stack>
          <PublishingPreview />
        </Box>
        <Box
          render={
            <section id="how-it-works" aria-label="How publishing works" />
          }
          xstyle={styles.features}
        >
          <Stack>
            <HStack>
              <FilePenLineIcon size={22} aria-hidden="true" />
              <Heading render={<h2 />}>Keep the idea</Heading>
            </HStack>
            <Text>
              Save a draft, add your media, and shape the post before it goes
              out.
            </Text>
          </Stack>
          <Stack>
            <HStack>
              <CalendarDaysIcon size={22} aria-hidden="true" />
              <Heading render={<h2 />}>Give it a time</Heading>
            </HStack>
            <Text>
              Build your publishing week in the calendar. See what is ready and
              what comes next.
            </Text>
          </Stack>
          <Stack>
            <HStack>
              <RadioIcon size={22} aria-hidden="true" />
              <Heading render={<h2 />}>Get it out there</Heading>
            </HStack>
            <Text>
              Connect your channels, publish your posts, and review the results
              from your workspace.
            </Text>
          </Stack>
        </Box>
      </Box>
    </PublicShell>
  )
}
