import { defineConfig } from "drizzle-kit"
import { Effect } from "effect"

import { localDatabasePath } from "env/database"

export default defineConfig({
  dialect: "sqlite",
  schema: "./packages/db/src/schema/{core,social,deletion,session}.ts",
  out: "./packages/db/src/migrations",
  strict: true,
  dbCredentials: process.argv.includes("studio")
    ? { url: Effect.runSync(localDatabasePath()) }
    : undefined,
})
