import { Link, useRouter } from "@tanstack/react-router"

import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { PageHeading } from "@/components/desk-ui"
import { WorkspaceLoading } from "@/components/workspace-loading"

export function RoutePending() {
  return <WorkspaceLoading />
}

export function RouteFailure() {
  const router = useRouter()

  return (
    <Stack>
      <PageHeading title="Page unavailable" />
      <Text role="alert">This page could not load.</Text>
      <HStack>
        <Button onClick={() => void router.invalidate()}>Try again</Button>
        <Button render={<Link to="/queue" search={{}} />} variant="outline">
          Return to publishing
        </Button>
      </HStack>
    </Stack>
  )
}

export function RouteNotFound() {
  return (
    <Stack>
      <PageHeading title="Page not found" />
      <Text>The page address is not valid.</Text>
      <Button render={<Link to="/queue" search={{}} />} variant="outline">
        Return to publishing
      </Button>
    </Stack>
  )
}
