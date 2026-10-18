import { createLazyFileRoute } from "@tanstack/react-router"

import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"

import { PageHeading } from "@/components/desk-ui"
import { useDeskWorkspace } from "@/components/desk-workspace"
import { Composer } from "@/features/posts/components/composer"
import { PostFilters } from "@/features/posts/components/post-filters"
import { PostList } from "@/features/posts/components/post-list"
import { PublicationCalendar } from "@/features/posts/components/publication-calendar"
import { usePostEditor } from "@/features/posts/hooks/use-post-editor"
import { usePostFilters } from "@/features/posts/hooks/use-post-filters"

export const Route = createLazyFileRoute("/_desk/calendar/")({
  component: CalendarPage,
})

export function CalendarPage() {
  const workspace = useDeskWorkspace()
  const editor = usePostEditor()

  const filters = usePostFilters({
    timezone: workspace.timezone,
    view: "calendar",
  })

  return (
    <Stack>
      <PageHeading title="Calendar">
        <HStack>
          <Button onClick={editor.createPost}>Create post</Button>
        </HStack>
      </PageHeading>
      <PublicationCalendar
        month={filters.criteria.month}
        date={filters.criteria.date}
        timezone={workspace.timezone}
        onMonthChange={(month) => {
          filters.setMonth(month)
          filters.setDate(`${month}-01`)
        }}
        onSelect={filters.setDate}
      />
      <PostFilters workspaceId={workspace.id} filters={filters} />
      <PostList
        workspace={workspace}
        filter="calendar"
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
