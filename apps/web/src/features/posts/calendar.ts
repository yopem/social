import { DateTime, Option, Schema } from "effect"

export function workspaceDate({
  instant,
  timezone,
}: {
  instant: DateTime.DateTime | string | Date
  timezone: string
}) {
  const value = DateTime.makeZoned(instant, { timeZone: timezone })

  return Option.isSome(value) ? DateTime.formatIsoDate(value.value) : ""
}

export function dateBounds({
  date,
  timezone,
  period = "day",
}: {
  date: string
  timezone: string
  period?: "day" | "month"
}) {
  if (
    !Schema.is(Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)))(
      date,
    )
  )
    return null

  const start = DateTime.makeZoned(`${date}T00:00:00Z`, {
    timeZone: timezone,
    adjustForTimeZone: true,
  })

  if (Option.isNone(start) || DateTime.formatIsoDate(start.value) !== date)
    return null

  return {
    scheduledFrom: DateTime.formatIso(start.value),
    scheduledBefore: DateTime.formatIso(
      DateTime.startOf(
        DateTime.add(
          start.value,
          period === "month" ? { months: 1 } : { days: 1 },
        ),
        period,
      ),
    ),
  }
}
