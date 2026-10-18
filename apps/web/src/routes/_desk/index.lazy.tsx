import { createLazyFileRoute } from "@tanstack/react-router"
import { useState } from "react"

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

export const Route = createLazyFileRoute("/_desk/")({
  component: QueuePage,
})

export function QueuePage() {
  const workspace = useDeskWorkspace()
  const editor = usePostEditor()

  const filters = usePostFilters({
    timezone: workspace.timezone,
    view: "queue",
  })

  const [history, setHistory] = useState(false)

  return (
    <Tabs
      value={history ? "history" : "queue"}
      onValueChange={(value) => {
        if (value === "queue" || value === "history")
          setHistory(value === "history")
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
                setHistory(true)
              editor.closeEditor(result)
            }}
          />
        )}
      </Stack>
    </Tabs>
  )
}
