import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_legal/tos/")({
  staticData: { legalTitle: "Terms of Service" },
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
})
