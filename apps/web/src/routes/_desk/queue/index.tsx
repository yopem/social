import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"

import { PublishingSearch } from "@/features/posts/schema"

export const Route = createFileRoute("/_desk/queue/")({
  staticData: { deskView: "queue" },
  validateSearch: Schema.toStandardSchemaV1(PublishingSearch),
})
