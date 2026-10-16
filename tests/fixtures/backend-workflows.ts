import { DateTime, Effect, Layer, Option, Result, Schema } from "effect"
import { Egress } from "server/lib/egress"
import { AccountDeletion } from "server/services/deletion"
import { feedLayer, FeedService } from "server/services/feeds"
import { postLayer, PostService } from "server/services/posts"
import { SocialService } from "server/services/social"
import { mediaLayer, MediaService } from "server/storage/media"

import { CredentialCrypto } from "auth/services/crypto"
import {
  inspectBackendRetention,
  seedBackendPosts,
  seedBackendRecovery,
  seedBackendRetention,
} from "db/services/backend-fixture"
import { CoreDb } from "db/services/core"
import { RetentionDb } from "db/services/retention"
import type { AppConfig } from "env/server"
import { WorkerResources } from "env/server"
import { PostCursor } from "rpc/contracts/app"
import type { PostListPageInput, PostListPageResult } from "rpc/contracts/app"
import { ApiError } from "rpc/contracts/models"
import type { Media, Post, PostContent, User } from "rpc/contracts/models"

import { fixtureError } from "./auth"
import { fixtureConnections } from "./connections"

const content: PostContent = {
  text: "Backend workflow fixture",
  channelIds: [],
  mediaIds: [],
  overrides: [],
}

const paginationSetup = Effect.fn("paginationSetup")(function* (
  workspaceId: string,
  userId: string,
  timing?: { readonly scheduledAt?: string; readonly boundaryAt?: string },
) {
  const core = yield* CoreDb
  const workspace = yield* core.workspaceAccess(userId, workspaceId)
  const resources = yield* WorkerResources
  const time = yield* DateTime.now

  const scheduledAt =
    timing?.scheduledAt ?? DateTime.formatIso(DateTime.add(time, { days: 1 }))

  const zoned = DateTime.makeZoned(scheduledAt, {
    timeZone: workspace.timezone,
  })

  if (Option.isNone(zoned))
    return yield* fixtureError("Invalid fixture calendar time")

  const scheduledBefore = DateTime.formatIso(
    DateTime.startOf(DateTime.add(zoned.value, { days: 1 }), "day"),
  )

  const boundaryAt = timing?.boundaryAt ?? scheduledBefore
  const channelId = crypto.randomUUID()
  const channelName = `Backend scheduled channel ${channelId.slice(0, 8)}`
  yield* core.upsertChannel({
    id: channelId,
    workspaceId,
    platform: "x",
    backend: "fixture:backend",
    accountId: channelId,
    displayName: channelName,
    status: "connected",
  })

  const seeded = yield* seedBackendPosts(resources.DB, workspaceId, channelId, {
    scheduledAt,
    scheduledBefore,
    boundaryAt,
  })

  return {
    ...seeded,
    workspaceId,
    channelId,
    channelName,
    total: 107,
    text: "Older scheduled fixture",
    day: DateTime.formatIsoDate(zoned.value),
  }
})

const paginationChecks = Effect.fn("paginationChecks")(function* (
  userId: string,
  workspaceId: string,
) {
  const seed = yield* paginationSetup(workspaceId, userId)
  const posts = yield* PostService
  const core = yield* CoreDb

  const base: typeof PostListPageInput.Type = {
    workspaceId,
    filter: "all",
    limit: 25,
  }

  const filtered = yield* posts.listPage(userId, {
    ...base,
    channelId: seed.channelId,
    scheduledFrom: seed.scheduledAt,
    scheduledBefore: seed.scheduledBefore,
  })

  const wrongChannel = yield* posts.listPage(userId, {
    ...base,
    channelId: crypto.randomUUID(),
  })

  const allIds: string[] = []
  let cursor: typeof base.cursor

  do {
    const page = yield* posts.listPage(userId, { ...base, cursor })
    allIds.push(...page.items.map((post) => post.id))
    cursor = page.nextCursor ?? undefined
  } while (cursor)

  const expected = yield* core.listPostsPage({
    workspaceId,
    filter: "all",
    limit: 100,
  })

  const invalidRange = yield* posts
    .listPage(userId, {
      ...base,
      scheduledFrom: seed.scheduledBefore,
      scheduledBefore: seed.scheduledAt,
    })
    .pipe(Effect.result)

  const invalidLimit = yield* posts
    .listPage(userId, { ...base, limit: 0 })
    .pipe(Effect.result)

  const denied = yield* posts
    .listPage(userId, { ...base, workspaceId: crypto.randomUUID() })
    .pipe(Effect.result)

  const foreign = yield* core.createWorkspace(
    userId,
    "Foreign calendar workspace",
    "personal",
    "UTC",
  )

  const foreignPost = yield* core.savePost(foreign.id, content, null)
  yield* core.setPostState(foreign.id, foreignPost.id, "cancelled")
  const foreignDraft = yield* core.savePost(foreign.id, content, null)

  const draft: typeof PostListPageInput.Type = {
    ...base,
    filter: "draft",
    limit: 50,
  }

  const first = yield* posts.listPage(userId, draft)

  const second = yield* posts.listPage(userId, {
    ...draft,
    cursor: first.nextCursor ?? undefined,
  })

  const third = yield* posts.listPage(userId, {
    ...draft,
    cursor: second.nextCursor ?? undefined,
  })

  const hundred = yield* posts.listPage(userId, { ...draft, limit: 100 })

  const tail = yield* posts.listPage(userId, {
    ...draft,
    limit: 100,
    cursor: hundred.nextCursor ?? undefined,
  })

  const drafts = [...first.items, ...second.items, ...third.items]
  const targets = first.items.slice(0, 2)
  const deliveryIds = new Map<string, string[]>()
  const observedAt = DateTime.formatIso(yield* DateTime.now)

  for (let index = 41; index >= 0; index--) {
    const channelId = crypto.randomUUID()
    yield* core.upsertChannel({
      id: channelId,
      workspaceId,
      platform: "x",
      backend: "fixture:pagination-deliveries",
      accountId: channelId,
      displayName: `Pagination delivery ${index}`,
      status: "connected",
    })

    for (const post of targets) {
      const id = `${post.id}:delivery:${String(index).padStart(2, "0")}`
      yield* core.saveDelivery({
        id,
        postId: post.id,
        channelId,
        platform: "x",
        state: "scheduled",
        message: null,
        url: null,
        providerPostId: null,
        observedAt,
        retryDisposition: null,
      })
      const ids = deliveryIds.get(post.id) ?? []
      ids.push(id)
      deliveryIds.set(post.id, ids)
    }
  }

  const withDeliveries = yield* posts.listPage(userId, draft)
  const calendar = { ...base, filter: "calendar" as const, limit: 1 }

  const calendarFiltered = yield* posts.listPage(userId, {
    ...calendar,
    channelId: seed.channelId,
    scheduledFrom: seed.scheduledAt,
    scheduledBefore: seed.scheduledBefore,
  })

  const calendarWrongChannel = yield* posts.listPage(userId, {
    ...calendar,
    channelId: crypto.randomUUID(),
  })

  const calendarOutside = yield* posts.listPage(userId, {
    ...calendar,
    scheduledBefore: seed.scheduledAt,
  })

  const calendarIds: string[] = []
  const calendarWorkspaces: string[] = []
  cursor = undefined

  for (let pages = 0; pages < 5; pages++) {
    const page: typeof PostListPageResult.Type = yield* posts.listPage(userId, {
      ...calendar,
      cursor,
    })

    calendarIds.push(...page.items.map((post) => post.id))
    calendarWorkspaces.push(...page.items.map((post) => post.workspaceId))
    cursor = page.nextCursor ?? undefined

    if (!cursor) break
  }

  return {
    calendarWorkspaceScoped:
      calendarWorkspaces.every((id) => id === workspaceId) &&
      !calendarIds.includes(foreignPost.id),
    calendarChannelScoped: calendarWrongChannel.items.length === 0,
    calendarRangeScoped:
      calendarFiltered.items.length === 1 &&
      calendarFiltered.items[0]?.id === seed.scheduledId &&
      calendarFiltered.nextCursor === null &&
      calendarOutside.items.length === 0,
    calendarUniquePages:
      !cursor &&
      calendarIds.length === 2 &&
      new Set(calendarIds).size === 2 &&
      calendarIds.includes(seed.scheduledId) &&
      calendarIds.includes(seed.boundaryId),
    draftPageSizes:
      first.items.length === 50 &&
      second.items.length === 50 &&
      third.items.length === 5 &&
      first.nextCursor !== null &&
      second.nextCursor !== null &&
      third.nextCursor === null &&
      hundred.items.length === 100 &&
      hundred.nextCursor !== null &&
      tail.items.length === 5 &&
      tail.nextCursor === null,
    draftCursorOrder:
      new Set(drafts.map((post) => post.id)).size === 105 &&
      drafts.every(
        (post, index) =>
          post.id === [...hundred.items, ...tail.items][index]?.id &&
          post.id === allIds[index] &&
          (index === 0 || (drafts[index - 1]?.id ?? "") > post.id),
      ),
    draftWorkspaceScoped:
      drafts.every((post) => post.workspaceId === workspaceId) &&
      !drafts.some((post) => post.id === foreignDraft.id),
    deliveryCapAndOrder:
      targets.length === 2 &&
      targets.every((target) => {
        const actual = withDeliveries.items.find(
          (post) => post.id === target.id,
        )?.deliveries

        const ids = [...(deliveryIds.get(target.id) ?? [])].sort().slice(0, 40)

        return (
          actual?.length === 40 &&
          actual.every((delivery, index) => delivery.id === ids[index])
        )
      }),
    deliveryIsolation:
      withDeliveries.items.length === 50 &&
      withDeliveries.items.every((post) =>
        targets.some((target) => target.id === post.id)
          ? post.deliveries.every((delivery) => delivery.postId === post.id)
          : post.deliveries.length === 0,
      ),
    olderScheduledVisible: filtered.items.some(
      (post) => post.id === seed.scheduledId,
    ),
    channelScoped:
      wrongChannel.items.length === 0 &&
      filtered.items.every((post) =>
        post.content.channelIds.includes(seed.channelId),
      ),
    halfOpenRange:
      filtered.items.length === 1 &&
      !filtered.items.some((post) => post.id === seed.boundaryId),
    stablePages:
      new Set(allIds).size === allIds.length &&
      allIds.length === 107 &&
      expected.items.every((post, index) => post.id === allIds[index]),
    invalidRangeRejected:
      Result.isFailure(invalidRange) &&
      invalidRange.failure.code === "invalid-input",
    invalidLimitRejected:
      Result.isFailure(invalidLimit) &&
      invalidLimit.failure.code === "invalid-input",
    workspaceDenied:
      Result.isFailure(denied) && denied.failure.code === "forbidden",
  }
})

const mediaChecks = Effect.fn("mediaChecks")(function* (
  userId: string,
  workspaceId: string,
) {
  const core = yield* CoreDb
  const media = yield* MediaService

  const other = yield* core.createWorkspace(
    userId,
    "Other media workspace",
    "personal",
    "UTC",
  )

  const ids = Array.from({ length: 3 }, () => crypto.randomUUID())

  for (const [index, id] of ids.entries())
    yield* core.saveMedia({
      id,
      workspaceId: index === 2 ? other.id : workspaceId,
      name: "Fixture attachment.png",
      mediaType: "image/png",
      kind: "image",
      bytes: 8,
      url: `/media/${id}`,
      objectKey: `${workspaceId}/${id}`,
    })
  const requested = [ids[1], ids[0]]
  const listed = yield* media.list(userId, { workspaceId, mediaIds: requested })
  const empty = yield* media.list(userId, { workspaceId, mediaIds: [] })

  const unknown = yield* media
    .list(userId, { workspaceId, mediaIds: [crypto.randomUUID()] })
    .pipe(Effect.result)

  const cross = yield* media
    .list(userId, { workspaceId, mediaIds: [ids[2]] })
    .pipe(Effect.result)

  const denied = yield* media
    .list(userId, { workspaceId: crypto.randomUUID(), mediaIds: [] })
    .pipe(Effect.result)

  const duplicates = yield* media.list(userId, {
    workspaceId,
    mediaIds: [ids[0], ids[0]],
  })

  const tooMany = yield* media
    .list(userId, {
      workspaceId,
      mediaIds: Array.from({ length: 21 }, () => ids[0]),
    })
    .pipe(Effect.result)

  return {
    duplicatesPreserved:
      duplicates.length === 2 && duplicates.every((item) => item.id === ids[0]),
    tooManyRejected:
      Result.isFailure(tooMany) && tooMany.failure.code === "invalid-input",
    inputOrder: listed.every((item, index) => item.id === requested[index]),
    privateUrls: listed.every(
      (item) => item.url === `/media/${item.id}` && !("objectKey" in item),
    ),
    emptyList: empty.length === 0,
    unknownDenied:
      Result.isFailure(unknown) && unknown.failure.code === "not-found",
    crossWorkspaceDenied:
      Result.isFailure(cross) && cross.failure.code === "not-found",
    workspaceDenied:
      Result.isFailure(denied) && denied.failure.code === "forbidden",
  }
})

const publicationChecks = Effect.fn("publicationChecks")(function* (
  userId: string,
  workspaceId: string,
) {
  const core = yield* CoreDb
  const original = yield* core.savePost(workspaceId, content, null)

  const edited = yield* core.savePost(
    workspaceId,
    { ...content, text: "Edited before claim" },
    null,
    original.id,
  )

  const changed = yield* core
    .claimPost(workspaceId, original.id, crypto.randomUUID(), original)
    .pipe(Effect.result)

  const schedule = yield* core.savePost(workspaceId, content, null)
  const time = yield* DateTime.now
  yield* core.savePost(
    workspaceId,
    content,
    DateTime.formatIso(DateTime.add(time, { days: 1 })),
    schedule.id,
  )

  const changedSchedule = yield* core
    .claimPost(workspaceId, schedule.id, crypto.randomUUID(), schedule)
    .pipe(Effect.result)

  const key = crypto.randomUUID()
  const unchanged = yield* core.claimPost(workspaceId, edited.id, key, edited)
  const idempotent = yield* core.claimPost(workspaceId, edited.id, key, edited)

  const differentKey = yield* core
    .claimPost(workspaceId, edited.id, crypto.randomUUID(), edited)
    .pipe(Effect.result)

  const cancelled = yield* core.savePost(workspaceId, content, null)
  yield* core.setPostState(workspaceId, cancelled.id, "cancelled")

  const cancelledClaim = yield* core
    .claimPost(workspaceId, cancelled.id, crypto.randomUUID(), cancelled)
    .pipe(Effect.result)

  const review = yield* core.savePost(workspaceId, content, null)
  yield* core.setPostState(workspaceId, review.id, "needs-review")

  const reviewClaim = yield* core
    .claimPost(workspaceId, review.id, crypto.randomUUID(), review)
    .pipe(Effect.result)

  const resources = yield* WorkerResources
  const queued = yield* core.savePost(workspaceId, content, null)
  yield* seedBackendRecovery(resources.DB, workspaceId, [queued.id])
  const loadedQueued = yield* core.getPost(workspaceId, queued.id)

  const queuedMismatch = yield* core
    .claimPost(workspaceId, queued.id, `scheduled:${queued.id}`, {
      ...loadedQueued,
      content: { ...content, text: "Stale queued content" },
    })
    .pipe(Effect.result)

  yield* core.setPostState(
    workspaceId,
    edited.id,
    "pending",
    "Unresolved publication",
  )

  const cannotCancel = yield* core
    .cancelPost(workspaceId, edited.id)
    .pipe(Effect.result)

  const cannotEdit = yield* core
    .savePost(workspaceId, content, null, edited.id)
    .pipe(Effect.result)

  const connections = yield* fixtureConnections()
  const started = yield* connections.begin(userId, workspaceId, "x", "success")

  const accounts = yield* connections.discover(
    userId,
    workspaceId,
    started.attempt.id,
    started.attempt.state,
  )

  yield* connections.select(
    userId,
    workspaceId,
    started.attempt.id,
    accounts.map((account) => account.ref.accountId),
  )

  const channel = (yield* core.listChannels(workspaceId)).find((value) =>
    accounts.some(
      (account) =>
        value.backend === `${account.ref.backend}:${account.ref.accountId}` &&
        value.accountId === account.ref.accountId &&
        value.platform === account.ref.platform,
    ),
  )

  if (!channel)
    return yield* fixtureError("Publication count fixture channel missing")

  const counted = yield* core.savePost(
    workspaceId,
    { ...content, channelIds: [channel.id] },
    null,
  )

  const social = yield* SocialService
  let providerWrites = 0
  let preparations = 0
  let denyPreparation = false
  let race = true
  let diagnostics = ""

  const countedSocial = Layer.succeed(SocialService, {
    ...social,
    prepare: Effect.fn("fixtureRacePrepare")(function* (
      principal: string,
      workspace: string,
      post: Post,
      files: readonly Media[],
    ) {
      preparations++

      if (denyPreparation)
        return yield* Effect.fail(
          new ApiError({
            code: "upstream-failure",
            message: "Fixture preparation now unavailable",
          }),
        )
      yield* social.prepare(principal, workspace, post, files)

      if (race)
        yield* core.savePost(
          workspace,
          { ...post.content, text: "Concurrent edit before provider write" },
          post.scheduledAt,
          post.id,
        )
    }),
    publish: Effect.fn("fixtureCountedPublish")(function* (
      principal: string,
      workspace: string,
      post: Post,
      files: readonly Media[],
      key: string,
    ) {
      providerWrites++

      return yield* social.publish(principal, workspace, post, files, key)
    }),
  })

  const writeCount = yield* Effect.gen(function* () {
    const service = yield* PostService
    const operation = crypto.randomUUID()

    const raced = yield* service
      .publish(userId, workspaceId, counted.id, operation)
      .pipe(Effect.result)

    const rejectedWithoutWrite =
      Result.isFailure(raced) &&
      raced.failure.code === "conflict" &&
      providerWrites === 0

    race = false

    const published = yield* service.publish(
      userId,
      workspaceId,
      counted.id,
      operation,
    )

    const beforeRepeat = preparations
    denyPreparation = true

    const repeated = yield* service.publish(
      userId,
      workspaceId,
      counted.id,
      operation,
    )

    const terminalRepeatWithoutPreparation =
      preparations === beforeRepeat &&
      JSON.stringify(repeated) === JSON.stringify(published)

    const wrongKey = yield* service
      .publish(userId, workspaceId, counted.id, crypto.randomUUID())
      .pipe(Effect.result)

    const active = yield* core.savePost(workspaceId, counted.content, null)
    const activeKey = crypto.randomUUID()
    yield* core.claimPost(workspaceId, active.id, activeKey, active)

    const activeResult = yield* service.publish(
      userId,
      workspaceId,
      active.id,
      activeKey,
    )

    const activeWrongKey = yield* service
      .publish(userId, workspaceId, active.id, crypto.randomUUID())
      .pipe(Effect.result)

    const activeCancel = yield* core
      .cancelPost(workspaceId, active.id)
      .pipe(Effect.result)

    diagnostics = JSON.stringify({
      providerWrites,
      preparations,
      rejectedWithoutWrite,
      race: Result.isFailure(raced)
        ? { code: raced.failure.code, message: raced.failure.message }
        : { state: raced.success.state },
      publishedState: published.state,
      deliveries: published.deliveries.map((delivery) => ({
        state: delivery.state,
        message: delivery.message,
      })),
    })

    return {
      publicationWriteCount:
        rejectedWithoutWrite &&
        providerWrites === 1 &&
        published.state === "published" &&
        published.deliveries.length === 1,
      terminalRepeatWithoutPreparation,
      activeRepeatWithoutPreparation:
        preparations === beforeRepeat &&
        activeResult.state === "pending" &&
        activeResult.deliveries.length === 0 &&
        Result.isFailure(activeCancel),
      differentKeyWithoutPreparation:
        preparations === beforeRepeat &&
        Result.isFailure(wrongKey) &&
        wrongKey.failure.code === "conflict" &&
        Result.isFailure(activeWrongKey) &&
        activeWrongKey.failure.code === "conflict",
    }
  }).pipe(
    Effect.provide(Layer.fresh(postLayer.pipe(Layer.provide(countedSocial)))),
  )

  return {
    checks: {
      ...writeCount,
      changedContentRejected:
        Result.isFailure(changed) && changed.failure.code === "conflict",
      changedScheduleRejected:
        Result.isFailure(changedSchedule) &&
        changedSchedule.failure.code === "conflict",
      unchangedClaimed: unchanged,
      sameKeyIdempotent: !idempotent,
      differentKeyRejected:
        Result.isFailure(differentKey) &&
        differentKey.failure.code === "conflict",
      cancelledRejected:
        Result.isFailure(cancelledClaim) &&
        cancelledClaim.failure.code === "conflict",
      needsReviewRejected:
        Result.isFailure(reviewClaim) &&
        reviewClaim.failure.code === "conflict",
      queuedSnapshotRejected:
        Result.isFailure(queuedMismatch) &&
        queuedMismatch.failure.code === "conflict",
      uncertainLockRetained:
        Result.isFailure(cannotCancel) && Result.isFailure(cannotEdit),
    },
    diagnostics,
  }
})

const retentionChecks = Effect.fn("retentionChecks")(function* (
  userId: string,
  workspaceId: string,
) {
  const resources = yield* WorkerResources
  const core = yield* CoreDb
  const retention = yield* RetentionDb

  const heldWorkspace = yield* core.createWorkspace(
    userId,
    "Held retention workspace",
    "personal",
    "UTC",
  )

  const seed = yield* seedBackendRetention(
    resources.DB,
    userId,
    workspaceId,
    heldWorkspace.id,
  )

  yield* retention.cleanup()

  const remaining = yield* inspectBackendRetention(
    resources.DB,
    seed.keys,
    seed.token,
  )

  return {
    expiredCredentialRemoved: !remaining.credentials.includes(seed.keys[0]),
    expiredLockRemoved: !remaining.locks.includes(seed.keys[0]),
    activeCredentialRetained: remaining.credentials.includes(seed.keys[1]),
    heldCredentialRetained: remaining.credentials.includes(seed.keys[2]),
    heldAccountLockRetained: remaining.locks.includes(seed.keys[2]),
    heldWorkspaceCredentialRetained: remaining.credentials.includes(
      seed.keys[3],
    ),
    heldWorkspaceLockRetained: remaining.locks.includes(seed.keys[3]),
  }
})

const snapshotChecks = Effect.fn("snapshotChecks")(function* (
  config: AppConfig,
) {
  const core = yield* CoreDb
  const resources = yield* WorkerResources
  const deletion = yield* AccountDeletion
  const id = crypto.randomUUID()

  const peer = yield* core.provisionUser(config.AUTH_ISSUER, {
    id: `snapshot:${id}`,
    name: "Snapshot fixture",
    email: `snapshot-${id}@fixtures.example.test`,
  })

  const workspace = (yield* core.listWorkspaces(peer.id))[0]

  if (!workspace) return yield* fixtureError("Snapshot workspace missing")
  const key = `feed-snapshots/${workspace.id}/feed/snapshot`
  const otherKey = `feed-snapshots/${id}/feed/snapshot`
  yield* Effect.tryPromise({
    try: () => resources.MEDIA.put(key, "fixture snapshot"),
    catch: () => fixtureError("Snapshot setup failed"),
  })
  yield* Effect.tryPromise({
    try: () => resources.MEDIA.put(otherKey, "other snapshot"),
    catch: () => fixtureError("Snapshot setup failed"),
  })

  const remoteOwner = yield* core.provisionUser(config.AUTH_ISSUER, {
    id: `scheduled-snapshot:${id}`,
    name: "Scheduled snapshot fixture",
    email: `scheduled-snapshot-${id}@fixtures.example.test`,
  })

  const remoteWorkspace = (yield* core.listWorkspaces(remoteOwner.id))[0]

  if (!remoteWorkspace)
    return yield* fixtureError("Scheduled snapshot workspace missing")
  const channelId = crypto.randomUUID()
  yield* core.upsertChannel({
    id: channelId,
    workspaceId: remoteWorkspace.id,
    platform: "x",
    backend: "fixture:scheduled-snapshot",
    accountId: id,
    displayName: "Scheduled snapshot channel",
    status: "connected",
  })

  const remotePost = yield* core.savePost(
    remoteWorkspace.id,
    { ...content, channelIds: [channelId] },
    null,
  )

  const time = yield* DateTime.now
  yield* core.saveDelivery({
    id: crypto.randomUUID(),
    postId: remotePost.id,
    channelId,
    platform: "x",
    state: "scheduled",
    message: null,
    url: null,
    providerPostId: `fixture-scheduled:${id}`,
    observedAt: DateTime.formatIso(time),
    retryDisposition: null,
  })
  yield* core.setPostState(remoteWorkspace.id, remotePost.id, "pending")
  const ownBlocked = yield* deletion.remove(remoteOwner.id).pipe(Effect.result)
  yield* deletion.remove(peer.id)

  const removed = yield* Effect.tryPromise({
    try: () => resources.MEDIA.head(key),
    catch: () => fixtureError("Snapshot verification failed"),
  })

  const retained = yield* Effect.tryPromise({
    try: () => resources.MEDIA.head(otherKey),
    catch: () => fixtureError("Snapshot verification failed"),
  })

  yield* Effect.tryPromise({
    try: () => resources.MEDIA.delete(otherKey),
    catch: () => fixtureError("Snapshot cleanup failed"),
  })

  return {
    ownScheduledDeliveryBlocksDeletion:
      Result.isFailure(ownBlocked) && ownBlocked.failure.code === "conflict",
    snapshotRemoved: removed === null,
    otherWorkspaceRetained: retained !== null,
  }
})

const rssChecks = Effect.fn("rssChecks")(function* (
  userId: string,
  workspaceId: string,
  config: AppConfig,
) {
  const core = yield* CoreDb
  const resources = yield* WorkerResources
  const cipher = yield* CredentialCrypto

  const feed = yield* core.saveFeed(workspaceId, {
    url: "https://feeds.example.test/rss",
    name: "Tombstone fixture",
    mode: "draft",
    channelIds: [],
    includeImages: true,
    includeVideos: false,
    enabled: true,
  })

  const deletedKey = yield* cipher.hash("deleted-item")
  const laterKey = yield* cipher.hash("later-item")

  const imported = yield* core.importFeedPost(
    workspaceId,
    feed.id,
    deletedKey,
    content,
  )

  if (!imported.post) return yield* fixtureError("RSS fixture import missing")
  yield* core.deletePost(workspaceId, imported.post.id)
  const { lastCheckedAt: _checked, error: _error, ...feedConfig } = feed
  const revision = yield* cipher.hash(JSON.stringify(feedConfig))
  const snapshotId = crypto.randomUUID()
  const key = `feed-snapshots/${workspaceId}/${feed.id}/${snapshotId}`

  const xml =
    '<rss version="2.0"><channel><title>Fixture</title><item><guid>deleted-item</guid><title>Deleted draft</title><enclosure url="https://fixtures.example.test/failing.png" type="image/png" /></item><item><guid>later-item</guid><title>Later entry</title></item></channel></rss>'

  yield* Effect.tryPromise({
    try: () =>
      resources.MEDIA.put(key, xml, { customMetadata: { base: feed.url } }),
    catch: () => fixtureError("RSS snapshot setup failed"),
  })

  let enclosureRequests = 0

  const watchedEgress = Layer.succeed(Egress, {
    open: Effect.fn("fixtureEnclosureOpen")(function* (_url: string) {
      enclosureRequests++

      return yield* Effect.fail(
        new ApiError({
          code: "upstream-failure",
          message: "Fixture enclosure unavailable",
        }),
      )
    }),
  })

  const refreshed = yield* Effect.gen(function* () {
    const feeds = yield* FeedService

    return yield* feeds.refresh(userId, workspaceId, feed.id, {
      snapshotId,
      offset: 0,
      revision,
    })
  }).pipe(
    Effect.provide(
      Layer.fresh(
        feedLayer.pipe(
          Layer.provide(
            mediaLayer(resources, config).pipe(Layer.provide(watchedEgress)),
          ),
        ),
      ),
    ),
  )

  const existing = yield* core.findImportedPost(
    workspaceId,
    feed.id,
    deletedKey,
  )

  const later = yield* core.findImportedPost(workspaceId, feed.id, laterKey)

  const deleted = yield* core.importFeedPost(
    workspaceId,
    feed.id,
    deletedKey,
    content,
  )

  return {
    enclosureNotRequested: enclosureRequests === 0,
    deletedDraftSkipped: !deleted.created && deleted.post === null,
    laterEntryImported:
      refreshed.imported === 1 && later?.post !== null && later !== null,
    noResurrection: existing?.post === null,
  }
})

const recoveryChecks = Effect.fn("recoveryChecks")(function* (
  workspaceId: string,
) {
  const core = yield* CoreDb
  const resources = yield* WorkerResources

  const created = yield* Effect.forEach([0, 1, 2, 3], () =>
    core.savePost(workspaceId, content, null),
  )

  const ids = created.map((post) => post.id)
  yield* seedBackendRecovery(resources.DB, workspaceId, ids)
  const due = yield* core.claimDuePosts(100)
  const recovered = due.find((post) => post.id === ids[0])

  const sameKey = recovered
    ? yield* core.claimPost(
        workspaceId,
        recovered.id,
        `scheduled:${recovered.id}`,
        recovered,
      )
    : false

  return {
    expiredEnqueuedRecovered: recovered !== undefined,
    sameOperationKey: sameKey,
    legacyEnqueuedRecovered: due.some((post) => post.id === ids[3]),
    freshEnqueuedRetained: !due.some((post) => post.id === ids[1]),
    dispatchingRetained: !due.some((post) => post.id === ids[2]),
  }
})

const timezoneChecks = Effect.fn("timezoneChecks")(function* (userId: string) {
  const core = yield* CoreDb

  const invalid = yield* core
    .createWorkspace(userId, "Invalid timezone", "personal", "Not/AZone")
    .pipe(Effect.result)

  const valid = yield* core.createWorkspace(
    userId,
    "Valid timezone",
    "personal",
    "America/New_York",
  )

  return {
    invalidRejected:
      Result.isFailure(invalid) && invalid.failure.code === "invalid-input",
    validAccepted: valid.timezone === "America/New_York",
  }
})

export const backendWorkflowFixture = Effect.fn("backendWorkflowFixture")(
  function* (
    request: Request,
    config: AppConfig,
    user: User,
    workspaceId: string,
  ) {
    const scenario = new URL(request.url).pathname.split("/").at(-1)

    if (scenario === "setup") {
      const body = yield* Effect.tryPromise({
        try: () => request.text(),
        catch: () => fixtureError("Fixture setup body unreadable"),
      })

      const timing = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(
          Schema.Struct({
            scheduledAt: Schema.optional(PostCursor.fields.createdAt),
            boundaryAt: Schema.optional(PostCursor.fields.createdAt),
          }),
        ),
      )(body || "{}").pipe(
        Effect.mapError(
          () =>
            new ApiError({
              code: "invalid-input",
              message: "Fixture timestamps must use canonical UTC ISO values.",
            }),
        ),
      )

      return Response.json(yield* paginationSetup(workspaceId, user.id, timing))
    }

    const core = yield* CoreDb

    const isolated = yield* core.createWorkspace(
      user.id,
      "Backend workflow",
      "personal",
      "UTC",
    )

    let checks: Record<string, boolean>

    switch (scenario) {
      case "pagination":
        checks = yield* paginationChecks(user.id, isolated.id)
        break
      case "media":
        checks = yield* mediaChecks(user.id, isolated.id)
        break
      case "publication":
        return Response.json(yield* publicationChecks(user.id, isolated.id))
      case "retention":
        checks = yield* retentionChecks(user.id, isolated.id)
        break
      case "snapshots":
        checks = yield* snapshotChecks(config)
        break
      case "rss":
        checks = yield* rssChecks(user.id, isolated.id, config)
        break
      case "recovery":
        checks = yield* recoveryChecks(isolated.id)
        break
      case "timezone":
        checks = yield* timezoneChecks(user.id)
        break
      default:
        return yield* new ApiError({
          code: "invalid-input",
          message: "Unknown backend fixture scenario",
        })
    }

    return Response.json(
      yield* Schema.decodeUnknownEffect(
        Schema.Struct({ checks: Schema.Record(Schema.String, Schema.Boolean) }),
      )({ checks }).pipe(
        Effect.mapError(() => fixtureError("Invalid backend report")),
      ),
    )
  },
)
