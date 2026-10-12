import { Effect, Schema } from "effect"
import { realpathSync, readdirSync, statSync } from "node:fs"
import { basename, dirname, join, resolve } from "node:path"

const LocalDatabasePath = Schema.NonEmptyString

export class DatabaseConfigError extends Schema.TaggedError<DatabaseConfigError>()(
  "DatabaseConfigError",
  { message: Schema.String },
) {}

export function localDatabasePath() {
  return Effect.gen(function* () {
    const { directory, files } = yield* Effect.try({
      try: () => {
        const directory = realpathSync(
          resolve(".alchemy/miniflare/v3/d1/miniflare-D1DatabaseObject"),
        )

        const files = readdirSync(directory).filter((name) =>
          /^[a-f0-9]{64}\.sqlite$/.test(name),
        )

        return { directory, files }
      },
      catch: () =>
        new DatabaseConfigError({
          message: "Cannot read this project's local D1 directory",
        }),
    })

    const configured = process.env["DRIZZLE_LOCAL_D1_PATH"]

    if (!configured && files.length !== 1)
      return yield* new DatabaseConfigError({
        message:
          "Set DRIZZLE_LOCAL_D1_PATH to this project's isolated local D1 SQLite file",
      })

    const input = yield* Schema.decodeUnknownEffect(LocalDatabasePath)(
      configured ?? join(directory, files[0] ?? ""),
    ).pipe(
      Effect.mapError(
        () =>
          new DatabaseConfigError({
            message: "Invalid local D1 path",
          }),
      ),
    )

    const { path, file } = yield* Effect.try({
      try: () => {
        const path = realpathSync(input)

        return { path, file: statSync(path).isFile() }
      },
      catch: () =>
        new DatabaseConfigError({
          message: "Cannot read local D1 file",
        }),
    })

    if (dirname(path) !== directory || !files.includes(basename(path)) || !file)
      return yield* new DatabaseConfigError({
        message: "Drizzle Studio requires this project's local D1 SQLite file",
      })

    return path
  })
}
