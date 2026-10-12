import { createClient } from "@openauthjs/openauth/client"

import type { AppConfig } from "env/server"

export function authClient(config: AppConfig, signal?: AbortSignal) {
  return createClient({
    clientID: config.AUTH_CLIENT_ID,
    issuer: config.AUTH_ISSUER,
    async fetch(input: RequestInfo | URL, init?: RequestInit) {
      const request = new Request(input, init)

      const response = await fetch(request, {
        signal: signal
          ? AbortSignal.any([signal, request.signal])
          : request.signal,
      })

      if (response.status === 429 || response.status >= 500)
        throw new Error("Authentication service temporarily unavailable")

      return response
    },
  })
}
