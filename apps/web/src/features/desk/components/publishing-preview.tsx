import * as stylex from "@stylexjs/stylex"
import { CalendarDaysIcon, CheckIcon, ImageIcon } from "lucide-react"

import { Box } from "ui/components/box"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  frame: {
    backgroundColor: tokens["--muted"],
    borderRadius: tokens["--radius-xl"],
    padding: {
      default: `calc(${tokens["--spacing"]} * 8)`,
      "@media (max-width: 500px)": `calc(${tokens["--spacing"]} * 4)`,
    },
    gap: `calc(${tokens["--spacing"]} * 6)`,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: `calc(${tokens["--spacing"]} * 3)`,
  },
  day: {
    display: "grid",
    gridTemplateColumns: "3rem minmax(0, 1fr)",
    gap: `calc(${tokens["--spacing"]} * 4)`,
  },
  date: {
    paddingBlockStart: `calc(${tokens["--spacing"]} * 4)`,
    color: tokens["--muted-foreground"],
  },
  post: {
    backgroundColor: tokens["--card"],
    color: tokens["--card-foreground"],
    borderRadius: tokens["--radius-md"],
    padding: `calc(${tokens["--spacing"]} * 5)`,
  },
  artwork: {
    minBlockSize: "9rem",
    backgroundColor: tokens["--primary"],
    color: tokens["--primary-foreground"],
    borderRadius: tokens["--radius-sm"],
    padding: `calc(${tokens["--spacing"]} * 5)`,
    display: "flex",
    alignItems: "end",
    fontSize: "2rem",
    letterSpacing: "-0.04em",
    fontWeight: 600,
    lineHeight: 1.1,
  },
  status: {
    display: "inline-flex",
    alignItems: "center",
    gap: `calc(${tokens["--spacing"]} * 1)`,
    color: tokens["--success-foreground"],
    backgroundColor: tokens["--muted"],
    borderRadius: tokens["--radius-sm"],
    padding: `calc(${tokens["--spacing"]} * 1.5)`,
  },
  muted: { color: tokens["--muted-foreground"] },
})

export function PublishingPreview() {
  return (
    <Box render={<figure aria-label="Sample publishing schedule" />}>
      <Stack xstyle={styles.frame}>
        <Box xstyle={styles.header}>
          <HStack>
            <CalendarDaysIcon size={18} aria-hidden="true" />
            <strong>Your publishing week</strong>
          </HStack>
          <span>June 8–12</span>
        </Box>
        <Box xstyle={styles.day}>
          <Box xstyle={styles.date}>
            Mon
            <br />
            <strong>08</strong>
          </Box>
          <Stack xstyle={styles.post}>
            <Box xstyle={styles.artwork}>
              Something good
              <br />
              is taking shape.
            </Box>
            <Text>A first look at what we’ve been working on.</Text>
            <Box xstyle={styles.header}>
              <span>LinkedIn</span>
              <span {...stylex.props(styles.status)}>
                <CheckIcon size={14} aria-hidden="true" />
                Published
              </span>
            </Box>
          </Stack>
        </Box>
        <Box xstyle={styles.day}>
          <Box xstyle={styles.date}>
            Wed
            <br />
            <strong>10</strong>
          </Box>
          <Stack xstyle={styles.post}>
            <HStack>
              <ImageIcon size={18} aria-hidden="true" />
              <strong>A little behind the scenes</strong>
            </HStack>
            <Text>Instagram</Text>
            <Text>Scheduled for 10:30 am</Text>
          </Stack>
        </Box>
        <Text xstyle={styles.muted}>Sample content. Your ideas go here.</Text>
      </Stack>
    </Box>
  )
}
