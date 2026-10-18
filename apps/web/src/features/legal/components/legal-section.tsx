import type { ReactNode } from "react"

import { Box } from "ui/components/box"
import { Heading } from "ui/components/heading"
import { Stack } from "ui/components/stack"

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
