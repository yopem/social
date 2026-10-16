import type { ReactNode } from "react"

import * as stylex from "@stylexjs/stylex"
import { Link } from "@tanstack/react-router"

import { Box } from "ui/components/ui/box"
import { Button } from "ui/components/ui/button"
import { Container } from "ui/components/ui/container"
import { Heading } from "ui/components/ui/heading"
import { Separator } from "ui/components/ui/separator"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"
import { Wrap } from "ui/components/ui/wrap"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  page: {
    maxInlineSize: "76ch",
    paddingBlock: `calc(${tokens["--spacing"]} * 10)`,
  },
  link: {
    color: tokens["--foreground"],
    textUnderlineOffset: 4,
    ":hover": { textDecorationLine: "underline" },
    ":focus-visible": {
      outline: `2px solid ${tokens["--ring"]}`,
      outlineOffset: 4,
    },
  },
  skip: {
    position: "fixed",
    insetBlockStart: 8,
    insetInlineStart: 8,
    zIndex: 100,
    padding: 12,
    color: tokens["--foreground"],
    backgroundColor: tokens["--background"],
    transform: { default: "translateY(-200%)", ":focus": "translateY(0)" },
  },
})

export function LegalLinks() {
  return (
    <Box render={<nav />} aria-label="Legal">
      <Wrap>
        <Button variant="link" size="xs" render={<Link to="/tos" />}>
          Terms of Service
        </Button>
        <Button variant="link" size="xs" render={<Link to="/privacy-policy" />}>
          Privacy Policy
        </Button>
      </Wrap>
    </Box>
  )
}

export function LegalPage({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <>
      <a href="#legal-content" {...stylex.props(styles.skip)}>
        Skip to content
      </a>
      <Container xstyle={styles.page}>
        <Stack>
          <Box render={<header />}>
            <Wrap>
              <Link to="/" {...stylex.props(styles.link)}>
                Publishing desk
              </Link>
              <LegalLinks />
            </Wrap>
          </Box>
          <Separator />
          <Box render={<main />} id="legal-content" tabIndex={-1}>
            <Stack>
              <Stack>
                <Heading render={<h1>{title}</h1>} />
                <Text>Effective date: October 12, 2026</Text>
              </Stack>
              {children}
              <LegalSection title="Contact">
                <Text>
                  Contact Yopem Social at{" "}
                  <a href="mailto:support@yopem.com">support@yopem.com</a> for
                  support, privacy questions, or data requests. Our public app
                  is <a href="https://social.yopem.com">social.yopem.com</a>.
                </Text>
              </LegalSection>
            </Stack>
          </Box>
        </Stack>
      </Container>
    </>
  )
}

export function LegalSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <Box render={<section />}>
      <Stack>
        <Heading>{title}</Heading>
        {children}
      </Stack>
    </Box>
  )
}
