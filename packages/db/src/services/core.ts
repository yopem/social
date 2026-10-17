import type { D1Database } from "@cloudflare/workers-types"
import type { BatchItem } from "drizzle-orm/batch"

import { drizzle } from "drizzle-orm/d1"
import { DateTime, Effect, Schema } from "effect"

import { DatabaseRunResult } from "db/services/validation"
import { ApiError } from "rpc/lib/errors"

export function failure(code: ApiError["code"], message: string) {
  return new ApiError({ code, message })
}

export function now(offset = 0) {
  return DateTime.now.pipe(
    Effect.map((time) =>
      DateTime.formatIso(DateTime.addDuration(time, offset)),
    ),
  )
}

export function hash(value: string) {
  return Effect.tryPromise({
    try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    catch: () => failure("storage-failure", "Hash failed"),
  }).pipe(
    Effect.map((digest) =>
      Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join(""),
    ),
  )
}

export function makeCoreContext(db: D1Database) {
  const client = drizzle(db)

  function query<A, I, Row>(
    schema: Schema.Codec<A, I>,
    execute: () => PromiseLike<readonly Row[]>,
  ) {
    return Effect.tryPromise({
      try: () => Promise.resolve(execute()),
      catch: () => failure("storage-failure", "Database operation failed"),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(schema))),
      Effect.mapError(() =>
        failure("storage-failure", "Database operation failed"),
      ),
    )
  }

  function write<Result>(execute: () => PromiseLike<Result>) {
    return Effect.tryPromise({
      try: () => Promise.resolve(execute()),
      catch: () => failure("storage-failure", "Database write failed"),
    }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(DatabaseRunResult)),
      Effect.mapError(() =>
        failure("storage-failure", "Invalid database write result."),
      ),
      Effect.asVoid,
    )
  }

  function batch(
    statements: readonly [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]],
  ) {
    return Effect.tryPromise({
      try: () => client.batch(statements),
      catch: () => failure("storage-failure", "Atomic database write failed"),
    }).pipe(
      Effect.flatMap(
        Schema.decodeUnknownEffect(Schema.Array(DatabaseRunResult)),
      ),
      Effect.mapError(() =>
        failure("storage-failure", "Invalid database batch result."),
      ),
      Effect.asVoid,
    )
  }

  function required<A>(rows: readonly A[]) {
    return rows[0] === undefined
      ? Effect.fail(failure("not-found", "Record not found"))
      : Effect.succeed(rows[0])
  }

  return { client, query, write, batch, required }
}

export type CoreContext = ReturnType<typeof makeCoreContext>
