import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_desk/analytics/")({
  staticData: { deskView: "analytics" },
})
