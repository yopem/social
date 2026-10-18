import { createLazyFileRoute } from "@tanstack/react-router"

import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"

import { PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { Composer } from "@/features/posts/components/composer"
import { PostFilters } from "@/features/posts/components/post-filters"
import { PostList } from "@/features/posts/components/post-list"
import { usePostEditor } from "@/features/posts/hooks/use-post-editor"
import { usePostFilters } from "@/features/posts/hooks/use-post-filters"

export const Route = createLazyFileRoute("/_desk/drafts/")({
  component: DraftsPage,
})

export function DraftsPage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const workspace = useDeskWorkspace()
  const editor = usePostEditor()

  const filters = usePostFilters({
    timezone: workspace.timezone,
    view: "drafts",
    search,
    onChange: (change) => {
      void navigate({ search: (previous) => ({ ...previous, ...change }) })
    },
  })

  return (
    <Stack>
      <PageHeading title="Drafts">
        <HStack>
          <Button onClick={editor.createPost}>Create post</Button>
        </HStack>
      </PageHeading>
      <PostFilters workspaceId={workspace.id} filters={filters} />
      <PostList
        workspace={workspace}
        filter="draft"
        criteria={filters.criteria}
        reviewOutcome={editor.reviewOutcome}
        onEdit={editor.editPost}
      />
      {editor.open && (
        <Composer
          workspace={workspace}
          post={editor.post}
          onClose={editor.closeEditor}
        />
      )}
    </Stack>
  )
}
