import { createLazyFileRoute } from "@tanstack/react-router"

import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Tabs, TabsList, TabsTab, TabsPanel } from "ui/components/tabs"

import { PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { Composer } from "@/features/posts/components/composer"
import { PostFilters } from "@/features/posts/components/post-filters"
import { PostList } from "@/features/posts/components/post-list"
import { usePostEditor } from "@/features/posts/hooks/use-post-editor"
import { usePostFilters } from "@/features/posts/hooks/use-post-filters"

export const Route = createLazyFileRoute("/_desk/queue/")({
  component: QueuePage,
})

export function QueuePage() {
  const navigate = Route.useNavigate()
  const search = Route.useSearch()
  const workspace = useDeskWorkspace()
  const editor = usePostEditor()

  const filters = usePostFilters({
    timezone: workspace.timezone,
    view: "queue",
    search,
    onChange: (change) => {
      void navigate({ search: (previous) => ({ ...previous, ...change }) })
    },
  })

  const history = search.view === "history"

  return (
    <Tabs
      value={history ? "history" : "queue"}
      onValueChange={(value) => {
        if (value === "queue" || value === "history")
          void navigate({
            search: (previous) => ({ ...previous, view: value }),
          })
      }}
    >
      <Stack>
        <PageHeading title="Publishing queue">
          <HStack>
            <Button onClick={editor.createPost}>Create post</Button>
          </HStack>
        </PageHeading>
        <TabsList variant="underline" aria-label="Post view">
          <TabsTab value="queue">Queue</TabsTab>
          <TabsTab value="history">History</TabsTab>
        </TabsList>
        <PostFilters workspaceId={workspace.id} filters={filters} />
        <TabsPanel value={history ? "history" : "queue"}>
          <PostList
            workspace={workspace}
            filter={history ? "sent" : "queue"}
            criteria={filters.criteria}
            reviewOutcome={editor.reviewOutcome}
            onEdit={editor.editPost}
          />
        </TabsPanel>
        {editor.open && (
          <Composer
            workspace={workspace}
            post={editor.post}
            onClose={(result) => {
              if (
                result &&
                ["published", "partial", "failed"].includes(result.state)
              )
                void navigate({
                  search: (previous) => ({ ...previous, view: "history" }),
                })
              editor.closeEditor(result)
            }}
          />
        )}
      </Stack>
    </Tabs>
  )
}
