import * as stylex from "@stylexjs/stylex"
import { useQuery } from "@tanstack/react-query"

import { Button } from "ui/components/button"
import { HStack } from "ui/components/hstack"
import { Input } from "ui/components/input"
import { Text } from "ui/components/text"

import type { usePostFilters } from "@/features/posts/hooks/use-post-filters"

import { deskStyles } from "@/components/desk-styles"
import { Choice } from "@/components/desk-ui"
import { channelsQuery } from "@/features/channels/queries"

export function PostFilters({
  workspaceId,
  filters,
}: {
  workspaceId: string
  filters: ReturnType<typeof usePostFilters>
}) {
  const channels = useQuery(channelsQuery(workspaceId))
  const { criteria } = filters

  return (
    <>
      <HStack
        xstyle={[deskStyles.rowGap, deskStyles.wrap, deskStyles.alignCenter]}
      >
        <Choice
          label="Channel filter"
          value={criteria.channelId || "all"}
          options={[
            { value: "all", label: "All channels" },
            ...(channels.data?.channels ?? []).map((channel) => ({
              value: channel.id,
              label: channel.displayName,
            })),
          ]}
          onChange={(value) =>
            filters.setChannelId(value === "all" ? "" : value)
          }
        />
        <label htmlFor="posts-field-1" {...stylex.props(deskStyles.label)}>
          Calendar date
          <Input
            id="posts-field-1"
            nativeInput
            type="date"
            value={criteria.date}
            onChange={(event) => filters.setDate(event.target.value)}
          />
        </label>
        <Button variant="ghost" onClick={() => filters.setDate("")}>
          All dates
        </Button>
      </HStack>
      {criteria.bounds === null && (
        <Text role="alert">Choose a valid calendar date.</Text>
      )}
    </>
  )
}
