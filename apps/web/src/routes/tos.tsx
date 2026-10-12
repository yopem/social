import { createFileRoute } from "@tanstack/react-router"

import { TermsOfService } from "@/features/legal/components/terms-of-service"

export const Route = createFileRoute("/tos")({
  head: () => ({
    meta: [
      { title: "Terms of Service | Yopem Social" },
      {
        name: "description",
        content:
          "Terms for using Yopem Social publishing, scheduling, workspaces, and connected social accounts.",
      },
    ],
    links: [{ rel: "canonical", href: "https://social.yopem.com/tos" }],
  }),
  component: TermsOfService,
})
