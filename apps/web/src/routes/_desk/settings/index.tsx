import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_desk/settings/")({
  staticData: { deskView: "settings" },
})
