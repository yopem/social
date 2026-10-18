import * as stylex from "@stylexjs/stylex"
import { DateTime, Option, Schema } from "effect"

import { Button } from "ui/components/button"
import { Card, CardPanel } from "ui/components/card"
import { Heading } from "ui/components/heading"
import { HStack } from "ui/components/hstack"
import { Stack } from "ui/components/stack"
import { Text } from "ui/components/text"

import { deskStyles } from "@/components/desk-styles"

const styles = stylex.create({
  table: {
    inlineSize: "100%",
    tableLayout: "fixed",
    borderCollapse: "collapse",
  },
})

export function workspaceDate(
  instant: DateTime.DateTime | string | Date,
  timezone: string,
) {
  const value = DateTime.makeZoned(instant, { timeZone: timezone })

  return Option.isSome(value) ? DateTime.formatIsoDate(value.value) : ""
}

export function dateBounds(
  date: string,
  timezone: string,
  period: "day" | "month" = "day",
) {
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

export function PublicationCalendar({
  month,
  date,
  timezone,
  onMonthChange,
  onSelect,
}: {
  month: string
  date: string
  timezone: string
  onMonthChange: (month: string) => void
  onSelect: (date: string) => void
}) {
  const parsed = DateTime.make(`${month}-01T00:00:00Z`)

  if (
    Option.isNone(parsed) ||
    DateTime.formatIsoDate(parsed.value).slice(0, 7) !== month
  )
    return <Text role="alert">Choose a valid calendar month.</Text>

  const first = DateTime.startOf(parsed.value, "month")
  const firstWeekday = DateTime.toParts(first).weekDay

  const dayCount = DateTime.toParts(
    DateTime.subtract(DateTime.add(first, { months: 1 }), { days: 1 }),
  ).day

  const label = DateTime.format(first, { month: "long", year: "numeric" })

  function move(offset: number) {
    onMonthChange(
      DateTime.formatIsoDate(DateTime.add(first, { months: offset })).slice(
        0,
        7,
      ),
    )
  }

  return (
    <Card render={<section />} aria-label="Publication calendar">
      <CardPanel>
        <Stack>
          <HStack
            xstyle={[
              deskStyles.rowGap,
              deskStyles.wrap,
              deskStyles.alignCenter,
            ]}
          >
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous month"
              onClick={() => move(-1)}
            >
              Previous
            </Button>
            <Heading render={<h2>{label}</h2>} />
            <Button
              variant="outline"
              size="sm"
              aria-label="Next month"
              onClick={() => move(1)}
            >
              Next
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = workspaceDate(DateTime.nowUnsafe(), timezone)
                onMonthChange(today.slice(0, 7))
                onSelect(today)
              }}
            >
              Today
            </Button>
          </HStack>
          <table {...stylex.props(styles.table)} aria-label={label}>
            <thead>
              <tr>
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <th key={day} scope="col">
                      <Text xstyle={[deskStyles.text, deskStyles.small]}>
                        {day}
                      </Text>
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from(
                { length: Math.ceil((firstWeekday + dayCount) / 7) },
                (_, week) => (
                  <tr key={week}>
                    {Array.from({ length: 7 }, (_, weekday) => {
                      const day = week * 7 + weekday - firstWeekday + 1

                      if (day < 1 || day > dayCount)
                        return <td key={weekday} aria-label="No date" />
                      const current = DateTime.add(first, { days: day - 1 })
                      const key = DateTime.formatIsoDate(current)

                      const dayLabel = DateTime.format(current, {
                        dateStyle: "full",
                      })

                      return (
                        <td key={weekday}>
                          <HStack>
                            <Button
                              size="icon-sm"
                              variant={date === key ? "default" : "ghost"}
                              aria-label={`Select ${dayLabel}`}
                              aria-pressed={date === key}
                              onClick={() => onSelect(key)}
                            >
                              {day}
                            </Button>
                          </HStack>
                        </td>
                      )
                    })}
                  </tr>
                ),
              )}
            </tbody>
          </table>
          <Text xstyle={[deskStyles.text, deskStyles.small, deskStyles.muted]}>
            {date
              ? `Posts for ${date}`
              : "Select a day to view scheduled posts."}{" "}
            · {timezone}
          </Text>
        </Stack>
      </CardPanel>
    </Card>
  )
}
