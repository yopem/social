import { Link } from "@tanstack/react-router"

import { Box } from "ui/components/box"
import { Button } from "ui/components/button"
import { Wrap } from "ui/components/wrap"

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
