import { createClient } from "@openauthjs/openauth/client"

import type { AppConfig } from "env/server"

export function authClient(config: AppConfig) {
  return createClient({
    clientID: config.AUTH_CLIENT_ID,
    issuer: config.AUTH_ISSUER,
  })
}
