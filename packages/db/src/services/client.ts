import type { D1Database } from "@cloudflare/workers-types"

import { Context, Layer } from "effect"

import { makeDatabaseContext } from "db/services/context"

export class Database extends Context.Service<
  Database,
  ReturnType<typeof makeDatabaseContext>
>()("social/Database") {}

export function databaseLayer(
  bindings: { readonly DB: D1Database } | D1Database,
) {
  const db = "DB" in bindings ? bindings.DB : bindings

  return Layer.sync(Database, () => makeDatabaseContext(db))
}
