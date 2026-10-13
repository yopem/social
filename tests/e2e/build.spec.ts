import { expect } from "@playwright/test"
import { Effect } from "effect"
import { readdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { check, effectTest, step } from "./effect"

effectTest(
  "production bundles exclude fixtures and browser server modules",
  Effect.fnUntraced(function* () {
    for (const target of ["client", "server"] as const) {
      const directory = new URL(
        `../../apps/web/dist/${target}/`,
        import.meta.url,
      )

      const entries = yield* step(() => readdir(directory, { recursive: true }))
      const scripts = entries.filter((entry) => entry.endsWith(".js"))

      yield* check(() => expect(scripts.length).toBeGreaterThan(0))

      for (const script of scripts) {
        const path = fileURLToPath(new URL(script, directory))
        const source = yield* step(() => readFile(path, "utf8"))

        const forbidden = [
          "/__fixtures/",
          "fixture_namespace",
          "seedRetentionFixture",
          "fixtureAuth",
          "@effect/platform-node",
          "node:fs",
          ...(target === "client"
            ? ["drizzle-orm/d1", "deletionDbLayer", "accountDeletionLayer"]
            : []),
        ]

        for (const marker of forbidden) {
          yield* check(() =>
            expect(source.includes(marker), `${path}: ${marker}`).toBe(false),
          )
        }
      }
    }
  }),
)
