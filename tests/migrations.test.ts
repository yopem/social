import { Effect } from "effect"
import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vite-plus/test"

import {
  materializeMigrations,
  migrationStatements,
} from "db/scripts/migrations"

const trigger = `CREATE TRIGGER guard BEFORE INSERT ON users BEGIN
 SELECT CASE WHEN NEW.id='semi;colon' THEN RAISE(ABORT,'blocked;write') END;
 SELECT CASE WHEN NEW.id='second' THEN RAISE(ABORT,'second') END;
END;`

describe("Alchemy migration staging", () => {
  it("keeps trigger bodies and quoted semicolons in one statement", () => {
    const sql = `CREATE TABLE users (id TEXT);\n${trigger}\nALTER TABLE users ADD COLUMN name TEXT;`
    const statements = migrationStatements(sql)
    expect(statements).toHaveLength(3)
    expect(statements[1]).toBe(trigger)
  })

  it("keeps existing Kit breakpoints unchanged", () => {
    const sql =
      "CREATE TABLE one (id TEXT);\n--> statement-breakpoint\nCREATE TABLE two (id TEXT);"

    expect(migrationStatements(sql)).toEqual([
      "CREATE TABLE one (id TEXT);",
      "CREATE TABLE two (id TEXT);",
    ])
  })

  it("ignores comments and quoted SQL words", () => {
    expect(
      migrationStatements(
        "-- CREATE TRIGGER;\nCREATE TABLE sample (value TEXT DEFAULT 'BEGIN;END'); /* ; */",
      ),
    ).toHaveLength(1)
  })

  it("rejects incomplete statements", () => {
    expect(() =>
      migrationStatements(
        "CREATE TRIGGER guard AFTER INSERT ON users BEGIN SELECT 1;",
      ),
    ).toThrow()
    expect(() =>
      migrationStatements("CREATE TABLE bad (value TEXT DEFAULT 'oops);"),
    ).toThrow()
  })

  it("rejects stage paths outside local migration directory", async () => {
    await expect(
      Effect.runPromise(materializeMigrations("../outside")),
    ).rejects.toThrow()
  })

  it("materializes legacy files without changing source SQL", async () => {
    const file = "packages/db/src/migrations/0003_account_deletion.sql"
    const before = await readFile(file, "utf8")

    const directory = await Effect.runPromise(
      materializeMigrations("migration-check"),
    )

    const staged = await readFile(
      `${directory}/0003_account_deletion.sql`,
      "utf8",
    )

    expect(migrationStatements(staged)).toEqual(migrationStatements(before))
    expect(staged).toContain("--> statement-breakpoint")
    expect(await readFile(file, "utf8")).toBe(before)
  })
})
