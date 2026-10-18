import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"

import { PostFilterSearch } from "@/features/posts/schema"

export const Route = createFileRoute("/_desk/calendar/")({
  staticData: { deskView: "calendar" },
  validateSearch: Schema.toStandardSchemaV1(PostFilterSearch),
})
