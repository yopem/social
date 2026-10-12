import { createFileRoute } from "@tanstack/react-router"

import { PrivacyPolicy } from "@/features/legal/components/privacy-policy"

export const Route = createFileRoute("/privacy-policy")({
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
  component: PrivacyPolicy,
})
