import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_desk/channels/")({
  staticData: { deskView: "channels" },
})
