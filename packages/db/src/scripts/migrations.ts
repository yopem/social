import { NodeFileSystem } from "@effect/platform-node"
import { Effect, FileSystem, Schema } from "effect"
import { resolve } from "node:path"

import { InfrastructureError } from "env/deployment"

const Stage = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
)

export function migrationStatements(source: string) {
  if (source.includes("--> statement-breakpoint"))
    return source
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean)

  const statements: string[] = []

  const tokens = source.matchAll(
    /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[[^\]]*\]|[a-z_]+|[^\s]/gi,
  )

  let start = 0
  let trigger = false
  let depth = 0
  let words: string[] = []

  for (const match of tokens) {
    const token = match[0]

    if (token.startsWith("--") || token.startsWith("/*")) continue

    if (["'", '"', "`", "["].includes(token))
      throw new Error("Unclosed SQL quote")
    const word = token.toUpperCase()

    if (/^[A-Z_]+$/.test(word)) {
      words.push(word)

      if (word === "TRIGGER" && words[0] === "CREATE") trigger = true

      if (trigger && (word === "BEGIN" || word === "CASE")) depth += 1

      if (trigger && word === "END") depth -= 1
    }

    if (token === ";" && depth === 0) {
      statements.push(source.slice(start, match.index + 1).trim())
      start = match.index + 1
      trigger = false
      words = []
    }
  }

  if (depth !== 0 || words.length > 0)
    throw new Error("Incomplete SQL migration statement")

  return statements
}

export function materializeMigrations(stage: string) {
  return Effect.gen(function* () {
    const validStage = yield* Schema.decodeUnknownEffect(Stage)(stage).pipe(
      Effect.mapError(
        () =>
          new InfrastructureError({ operation: "Validate migration stage" }),
      ),
    )

    const directory = resolve(".alchemy", "migrations", validStage)
    const fs = yield* FileSystem.FileSystem
    yield* fs.makeDirectory(directory, { recursive: true })
    const sourceDirectory = resolve("packages/db/src/migrations")

    const names = (yield* fs.readDirectory(sourceDirectory))
      .filter((name) => name.endsWith(".sql"))
      .sort()

    const stagedNames = (yield* fs.readDirectory(directory)).filter((name) =>
      name.endsWith(".sql"),
    )

    if (stagedNames.some((name) => !names.includes(name)))
      return yield* new InfrastructureError({
        operation: "Migration staging contains files absent from source",
      })

    for (const name of names) {
      const source = yield* fs.readFileString(resolve(sourceDirectory, name))

      const staged = yield* Effect.try({
        try: () =>
          source.includes("--> statement-breakpoint")
            ? source
            : `${migrationStatements(source).join("\n--> statement-breakpoint\n")}\n`,
        catch: () =>
          new InfrastructureError({
            operation: "Parse Alchemy migration",
          }),
      })

      yield* fs.writeFileString(resolve(directory, name), staged)
    }

    return directory
  }).pipe(
    Effect.provide(NodeFileSystem.layer),
    Effect.mapError(
      () =>
        new InfrastructureError({
          operation: "Materialize Alchemy migrations",
        }),
    ),
  )
}
