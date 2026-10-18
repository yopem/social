import { DateTime } from "effect"
import { useState } from "react"

import type { PostFilterSearch } from "@/features/posts/schema"

import { dateBounds, workspaceDate } from "@/features/posts/calendar"

export function usePostFilters({
  timezone,
  view,
  search,
  onChange,
}: {
  timezone: string
  view: "queue" | "drafts" | "calendar"
  search: typeof PostFilterSearch.Type
  onChange: (change: typeof PostFilterSearch.Type) => void
}) {
  const [today] = useState(() =>
    workspaceDate({ instant: DateTime.nowUnsafe(), timezone }),
  )

  // Keep an empty date in search so reload does not select today again.
  const date =
    search.date ?? (view === "calendar" && !search.month ? today : "")
  const month = search.date
    ? search.date.slice(0, 7)
    : (search.month ?? today.slice(0, 7))
  const channelId = search.channelId ?? ""

  const bounds = date
    ? dateBounds({ date, timezone })
    : view === "calendar"
      ? dateBounds({ date: `${month}-01`, timezone, period: "month" })
      : undefined

  function setDate(value: string) {
    onChange({ date: value, ...(value ? { month: value.slice(0, 7) } : {}) })
  }

  function setMonth(value: string) {
    onChange({ month: value, date: `${value}-01` })
  }

  function setChannelId(value: string) {
    onChange({ channelId: value || undefined })
  }

  return {
    criteria: { date, month, channelId, timezone, bounds },
    setDate,
    setMonth,
    setChannelId,
  }
}
