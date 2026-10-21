import * as stylex from "@stylexjs/stylex"
import { CalendarDaysIcon, CheckIcon, ImageIcon } from "lucide-react"

import { Badge } from "ui/components/badge"
import { Box } from "ui/components/box"
import {
  Card,
  CardDescription,
  CardFrame,
  CardFrameHeader,
  CardPanel,
} from "ui/components/card"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { Wrap } from "ui/components/wrap"
import { tokens } from "ui/styles/tokens.stylex"

const styles = stylex.create({
  date: { inlineSize: "3rem" },
  post: { inlineSize: `calc(100% - ${tokens["--spacing"]} * 16)` },
  trailing: { marginInlineStart: "auto" },
  artwork: {
    inlineSize: "100%",
    blockSize: "auto",
    borderRadius: tokens["--radius-sm"],
  },
  artworkBackground: { fill: tokens["--primary"] },
  artworkText: {
    fill: tokens["--primary-foreground"],
    fontFamily: tokens["--font-sans"],
    fontSize: 28,
    fontWeight: 600,
  },
})

export function PublishingPreview() {
  return (
    <Box render={<figure aria-label="Sample publishing schedule" />}>
      <CardFrame>
        <CardFrameHeader>
          <Wrap>
            <HStack>
              <CalendarDaysIcon size={18} aria-hidden="true" />
              <strong>Your publishing week</strong>
            </HStack>
            <Box render={<span />} xstyle={styles.trailing}>
              June 8–12
            </Box>
          </Wrap>
        </CardFrameHeader>
        <CardPanel>
          <Stack>
            <HStack>
              <Box xstyle={styles.date}>
                Mon
                <br />
                <strong>08</strong>
              </Box>
              <Card xstyle={styles.post}>
                <CardPanel>
                  <Stack>
                    <svg
                      {...stylex.props(styles.artwork)}
                      viewBox="0 0 320 180"
                    >
                      <title>
                        Sample post artwork: Something good is taking shape.
                      </title>
                      <rect
                        {...stylex.props(styles.artworkBackground)}
                        width="320"
                        height="180"
                      />
                      <text
                        {...stylex.props(styles.artworkText)}
                        x="20"
                        y="110"
                      >
                        Something good
                        <tspan x="20" dy="32">
                          is taking shape.
                        </tspan>
                      </text>
                    </svg>
                    <Text>A first look at what we’ve been working on.</Text>
                    <Wrap>
                      <Box render={<span />}>LinkedIn</Box>
                      <Badge variant="success" xstyle={styles.trailing}>
                        <CheckIcon size={14} aria-hidden="true" />
                        Published
                      </Badge>
                    </Wrap>
                  </Stack>
                </CardPanel>
              </Card>
            </HStack>
            <HStack>
              <Box xstyle={styles.date}>
                Wed
                <br />
                <strong>10</strong>
              </Box>
              <Card xstyle={styles.post}>
                <CardPanel>
                  <Stack>
                    <HStack>
                      <ImageIcon size={18} aria-hidden="true" />
                      <strong>A little behind the scenes</strong>
                    </HStack>
                    <Text>Instagram</Text>
                    <Text>Scheduled for 10:30 am</Text>
                  </Stack>
                </CardPanel>
              </Card>
            </HStack>
            <CardDescription>
              Sample content. Your ideas go here.
            </CardDescription>
          </Stack>
        </CardPanel>
      </CardFrame>
    </Box>
  )
}
