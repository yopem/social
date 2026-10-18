import type { ReactNode } from "react"

import * as stylex from "@stylexjs/stylex"
import { Link } from "@tanstack/react-router"
import { LayersIcon } from "lucide-react"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Container } from "ui/components/container"
import { HStack } from "ui/components/hstack"
import { Text } from "ui/components/text"
import { tokens } from "ui/styles/tokens.stylex"

import { LegalLinks } from "@/features/legal/components/legal-links"

export const publicStyles = stylex.create({
  page: { minBlockSize: "100svh" },
  container: { maxInlineSize: "76rem" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: `calc(${tokens["--spacing"]} * 4)`,
    paddingBlock: `calc(${tokens["--spacing"]} * 6)`,
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    gap: `calc(${tokens["--spacing"]} * 3)`,
    color: tokens["--foreground"],
    fontWeight: 650,
    textDecoration: "none",
    borderRadius: tokens["--radius-sm"],
    outlineOffset: 6,
  },
  mark: {
    backgroundColor: tokens["--primary"],
    color: tokens["--primary-foreground"],
    padding: 8,
    borderRadius: tokens["--radius-md"],
  },
  hero: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) minmax(0, 1.05fr)",
      "@media (max-width: 800px)": "minmax(0, 1fr)",
    },
    alignItems: "center",
    gap: `calc(${tokens["--spacing"]} * 12)`,
    paddingBlock: {
      default: `calc(${tokens["--spacing"]} * 20)`,
      "@media (max-width: 800px)": `calc(${tokens["--spacing"]} * 10)`,
    },
  },
  title: {
    fontSize: {
      default: "clamp(2.75rem, 5.4vw, 4.75rem)",
      ":is(h1)": "clamp(2.75rem, 5.4vw, 4.75rem)",
    },
    fontWeight: 650,
    letterSpacing: "-0.065em",
    lineHeight: 1.06,
    textWrap: "balance",
    margin: 0,
    maxInlineSize: "12ch",
  },
  lead: {
    color: tokens["--muted-foreground"],
    fontSize: "1.125rem",
    lineHeight: 1.7,
    maxInlineSize: "43ch",
    margin: 0,
  },
  copy: { gap: `calc(${tokens["--spacing"]} * 7)` },
  note: { color: tokens["--muted-foreground"], maxInlineSize: "46ch" },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: `calc(${tokens["--spacing"]} * 4)`,
    paddingBlock: `calc(${tokens["--spacing"]} * 7)`,
    borderBlockStart: `1px solid ${tokens["--border"]}`,
  },
})

export function Brand() {
  return (
    <Link
      to="/"
      aria-label="Yopem Social home"
      {...stylex.props(publicStyles.brand)}
    >
      <LayersIcon
        size={36}
        aria-hidden="true"
        {...stylex.props(publicStyles.mark)}
      />
      Yopem Social
    </Link>
  )
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <Box xstyle={publicStyles.page}>
      <Container xstyle={publicStyles.container}>
        <Box render={<header />} xstyle={publicStyles.header}>
          <Brand />
          <HStack>
            <Button variant="ghost" render={<Link to="/sign-in" />}>
              Sign in
            </Button>
            <Button variant="outline" render={<Link to="/queue" search={{}} />}>
              Open workspace
            </Button>
          </HStack>
        </Box>
        {children}
        <Box render={<footer />} xstyle={publicStyles.footer}>
          <Text>Make room for your next idea.</Text>
          <LegalLinks />
        </Box>
      </Container>
    </Box>
  )
}
