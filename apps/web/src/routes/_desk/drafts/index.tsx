import { createFileRoute } from "@tanstack/react-router"
import { Schema } from "effect"

import { PostFilterSearch } from "@/features/posts/schema"

export const Route = createFileRoute("/_desk/drafts/")({
  staticData: { deskView: "drafts" },
  validateSearch: Schema.toStandardSchemaV1(PostFilterSearch),
})
