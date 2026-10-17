import type { D1Database } from "@cloudflare/workers-types"

import { Context, Effect, Layer } from "effect"

import { createIdentityRepository } from "db/services/accounts"
import { createChannelsRepository } from "db/services/channels"
import { makeCoreContext } from "db/services/core"
import { createFeedsRepository } from "db/services/feeds"
import { createMediaRepository } from "db/services/media"
import { createPostsRepository } from "db/services/posts"
import { createWorkspacesRepository } from "db/services/workspaces"

function makeCore(db: D1Database) {
  return Effect.sync(() => {
    const context = makeCoreContext(db)
    const channels = createChannelsRepository(context)
    const posts = createPostsRepository(context, channels)

    return {
      ...createIdentityRepository(context),
      ...createWorkspacesRepository(context),
      ...channels,
      ...posts,
      ...createMediaRepository(context),
      ...createFeedsRepository(context, channels, posts),
    }
  })
}

export class CoreDb extends Context.Service<
  CoreDb,
  Effect.Success<ReturnType<typeof makeCore>>
>()("social/CoreDb") {}

export function coreDbLayer(
  bindings: { readonly DB: D1Database } | D1Database,
) {
  const db = "DB" in bindings ? bindings.DB : bindings

  return Layer.effect(CoreDb, makeCore(db))
}
