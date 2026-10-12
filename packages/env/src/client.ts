import type { AppConfig } from "./server"

export function publicConfig(config: AppConfig) {
  return { appOrigin: config.APP_ORIGIN }
}
