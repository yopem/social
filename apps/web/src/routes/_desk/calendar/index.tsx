import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_desk/calendar/")({
  staticData: { deskView: "calendar" },
})
