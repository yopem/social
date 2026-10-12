import type { ReactNode } from "react"

import * as stylex from "@stylexjs/stylex"
import { Link } from "@tanstack/react-router"

import { Box } from "ui/components/ui/box"
import { Flex } from "ui/components/ui/flex"
import { Heading } from "ui/components/ui/heading"
import { Stack } from "ui/components/ui/stack"
import { Text } from "ui/components/ui/text"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  page: {
    width: "min(76ch, 100%)",
    marginInline: "auto",
  },
  link: {
    color: tokens["--foreground"],
    textUnderlineOffset: 4,
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
    <Flex render={<nav />} aria-label="Legal" spacing="normal" wrap>
      <Link to="/tos" {...stylex.props(styles.link)}>
        Terms of Service
      </Link>
      <Link to="/privacy-policy" {...stylex.props(styles.link)}>
        Privacy Policy
      </Link>
    </Flex>
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
      <Box padding="responsive" xstyle={styles.page}>
        <Stack spacing="loose">
          <Flex render={<header />} spacing="normal" wrap>
            <Link to="/" {...stylex.props(styles.link)}>
              Publishing desk
            </Link>
            <LegalLinks />
          </Flex>
          <Stack
            render={<main />}
            id="legal-content"
            tabIndex={-1}
            spacing="loose"
          >
            <Heading render={<h1>{title}</h1>} size="title" />
            <Text tone="muted" size="small">
              Effective date: October 12, 2026
            </Text>
            {children}
            <LegalSection title="Contact">
              <Text>
                Contact Yopem Social at{" "}
                <a href="mailto:support@yopem.com">support@yopem.com</a> for
                support, privacy questions, or data requests. Our public app is{" "}
                <a href="https://social.yopem.com">social.yopem.com</a>.
              </Text>
            </LegalSection>
          </Stack>
        </Stack>
      </Box>
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
    <Stack render={<section />} spacing="normal">
      <Heading>{title}</Heading>
      {children}
    </Stack>
  )
}
