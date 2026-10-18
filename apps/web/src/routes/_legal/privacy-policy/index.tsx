import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/_legal/privacy-policy/")({
  staticData: { legalTitle: "Privacy Policy" },
  head: () => ({
    meta: [
      { title: "Privacy Policy | Yopem Social" },
      {
        name: "description",
        content:
          "How Yopem Social handles account data, social credentials, publishing content, cookies, and deletion requests.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://social.yopem.com/privacy-policy" },
    ],
  }),
})
