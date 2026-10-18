import { DateTime } from "effect"
import { useState } from "react"

import { dateBounds, workspaceDate } from "@/features/posts/calendar"

export function usePostFilters({
  timezone,
  view,
}: {
  timezone: string
  view: "queue" | "drafts" | "calendar"
}) {
  const [today] = useState(() =>
    workspaceDate({ instant: DateTime.nowUnsafe(), timezone }),
  )

  const [date, setDate] = useState(view === "calendar" ? today : "")
  const [month, setMonth] = useState(() => today.slice(0, 7))
  const [channelId, setChannelId] = useState("")

  const bounds = date
    ? dateBounds({ date, timezone })
    : view === "calendar"
      ? dateBounds({ date: `${month}-01`, timezone, period: "month" })
      : undefined

  return {
    criteria: { date, month, channelId, timezone, bounds },
    setDate,
    setMonth,
    setChannelId,
  }
}
