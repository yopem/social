import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_desk/")({
  staticData: { deskView: "queue" },
})
