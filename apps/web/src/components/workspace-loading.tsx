import * as stylex from "@stylexjs/stylex"

import { Card, CardPanel } from "ui/components/card"
import { Container } from "ui/components/container"
import { HStack } from "ui/components/hstack"
import {
  Sidebar,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
} from "ui/components/sidebar"
import { Skeleton } from "ui/components/skeleton"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"
import { tokens } from "ui/styles/tokens.stylex"

import { Brand } from "@/components/public-shell"

const styles = stylex.create({
  main: { marginBlock: `calc(${tokens["--spacing"]} * 10)` },
  line: { blockSize: "1rem", inlineSize: "min(100%, 12rem)" },
})

export function WorkspaceLoading() {
  return (
    <SidebarProvider>
      <Sidebar aria-hidden="true">
        <SidebarHeader>
          <Stack>
            <Text>Publishing desk</Text>
            <Skeleton xstyle={styles.line} />
            <Skeleton xstyle={styles.line} />
            <Skeleton xstyle={styles.line} />
          </Stack>
        </SidebarHeader>
      </Sidebar>
      <SidebarInset>
        <Container xstyle={styles.main}>
          <Stack>
            <Brand />
            <output aria-live="polite">
              Opening your publishing workspace…
            </output>
            <Stack aria-hidden="true">
              {["first", "second", "third"].map((row) => (
                <Card key={row}>
                  <CardPanel>
                    <Stack>
                      <Skeleton xstyle={styles.line} />
                      <HStack>
                        <Skeleton xstyle={styles.line} />
                        <Skeleton xstyle={styles.line} />
                      </HStack>
                    </Stack>
                  </CardPanel>
                </Card>
              ))}
            </Stack>
          </Stack>
        </Container>
      </SidebarInset>
    </SidebarProvider>
  )
}
