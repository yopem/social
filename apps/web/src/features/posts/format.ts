import { DateTime } from "effect"

export function formatScheduledAt({
  timestamp,
  timezone,
}: {
  timestamp: string
  timezone: string
}) {
  return DateTime.format(
    DateTime.makeZonedUnsafe(timestamp, { timeZone: timezone }),
    { locale: "en-US", dateStyle: "medium", timeStyle: "short" },
  )
}
