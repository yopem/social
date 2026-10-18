import * as stylex from "@stylexjs/stylex"

import { Box } from "ui/components/box"
import { HStack } from "ui/components/hstack"
import { Skeleton } from "ui/components/skeleton"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { tokens } from "ui/styles/tokens.stylex"

import { Brand } from "@/components/public-shell"

const styles = stylex.create({
  shell: {
    display: "grid",
    gridTemplateColumns: {
      default: "15rem minmax(0, 1fr)",
      "@media (max-width: 700px)": "minmax(0, 1fr)",
    },
    minBlockSize: "100svh",
  },
  sidebar: {
    backgroundColor: tokens["--sidebar"],
    color: tokens["--sidebar-foreground"],
    padding: `calc(${tokens["--spacing"]} * 6)`,
    display: { default: "flex", "@media (max-width: 700px)": "none" },
  },
  main: {
    padding: {
      default: `calc(${tokens["--spacing"]} * 10)`,
      "@media (max-width: 700px)": `calc(${tokens["--spacing"]} * 5)`,
    },
    gap: `calc(${tokens["--spacing"]} * 8)`,
  },
  line: {
    height: "1rem",
    maxInlineSize: "12rem",
    width: "100%",
    animationName: {
      default: "none",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
  },
  row: {
    minBlockSize: "7rem",
    border: `1px solid ${tokens["--border"]}`,
    borderRadius: tokens["--radius-md"],
    padding: `calc(${tokens["--spacing"]} * 5)`,
    justifyContent: "center",
  },
})

export function WorkspaceLoading() {
  return (
    <Box render={<main />} xstyle={styles.shell}>
      <Stack xstyle={styles.sidebar} aria-hidden="true">
        <Text>Publishing desk</Text>
        <Skeleton xstyle={styles.line} />
        <Skeleton xstyle={styles.line} />
        <Skeleton xstyle={styles.line} />
      </Stack>
      <Stack xstyle={styles.main}>
        <Brand />
        <Text role="status" aria-live="polite">
          Opening your publishing workspace…
        </Text>
        <Stack aria-hidden="true">
          {["first", "second", "third"].map((row) => (
            <Stack key={row} xstyle={styles.row}>
              <Skeleton xstyle={styles.line} />
              <HStack>
                <Skeleton xstyle={styles.line} />
                <Skeleton xstyle={styles.line} />
              </HStack>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Box>
  )
}
