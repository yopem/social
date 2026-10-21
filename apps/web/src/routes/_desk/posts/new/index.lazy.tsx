import { createLazyFileRoute, Link, useBlocker } from "@tanstack/react-router"

import { Button } from "ui/components/button"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { ComposerForm } from "@/features/posts/components/composer-form"
import { useComposer } from "@/features/posts/hooks/use-composer"

export const Route = createLazyFileRoute("/_desk/posts/new/")({
  component: CreatePost,
})

export function CreatePost() {
  const workspace = useDeskWorkspace()
  const navigate = Route.useNavigate()

  const composer = useComposer({
    workspace,
    onClose: () => {
      void navigate({ to: "/drafts", search: { workspace: workspace.id } })
    },
  })

  useBlocker({
    shouldBlockFn: () => composer.attachments.uploading,
    enableBeforeUnload: composer.saving || composer.attachments.uploading,
  })

  return (
    <Stack>
      <PageHeading title="Create post">
        <Button
          variant="ghost"
          render={
            <Link
              to="/drafts"
              search={{ workspace: workspace.id }}
              onClick={(event) => {
                if (composer.saving || composer.attachments.uploading)
                  event.preventDefault()
              }}
            />
          }
          disabled={composer.saving || composer.attachments.uploading}
        >
          Back to drafts
        </Button>
      </PageHeading>
      <Text>
        Write your post, add media, then save a draft or choose when to publish.
      </Text>
      <ComposerForm composer={composer} timezone={workspace.timezone} wide />
    </Stack>
  )
}
