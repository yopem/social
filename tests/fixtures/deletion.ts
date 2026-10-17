import { DateTime, Effect, Schema } from "effect"
import { credentialKey } from "server/features/channels/sdk-stores"
import { JobService } from "server/features/publishing/jobs"

import { CredentialCrypto } from "auth/services/crypto"
import { AuthSession } from "auth/services/session"
import { DeletionDb } from "db/services/accounts/deletion"
import {
  seedLegacyOtherClaim,
  readLegacyOtherClaim,
  readRemotePostRow,
} from "db/services/accounts/deletion-fixture"
import { SocialDb } from "db/services/channels/social"
import { CoreDb } from "db/services/client"
import type { AppConfig } from "env/server"
import { WorkerResources } from "env/server"
import type { User } from "rpc/contracts/accounts"

import { fixtureCookie, fixtureError, fixtureJson } from "./auth"
import { fixtureConnections } from "./connections"

const Scenario = Schema.Literals(["sole", "shared-owner", "shared-member"])

const RemoteState = Schema.Literals([
  "accepted",
  "processing",
  "unknown",
  "scheduled",
  "dispatching-without-result",
])

const Ticket = Schema.Struct({
  scenario: Scenario,
  userId: Schema.String,
  workspaceId: Schema.String,
  sharedId: Schema.NullOr(Schema.String),
  postId: Schema.String,
  objectKey: Schema.String,
  before: Schema.Record(Schema.String, Schema.Number),
  staleCookie: Schema.String,
  workflowId: Schema.optional(Schema.String),
  legacy: Schema.optional(
    Schema.Struct({
      fixtureId: Schema.String,
      principalId: Schema.String,
      before: Schema.String,
    }),
  ),
  remote: Schema.optional(
    Schema.Struct({
      workspaceId: Schema.String,
      postId: Schema.String,
      channelId: Schema.String,
      snapshotId: Schema.String,
    }),
  ),
})

function readDeletionTicket(request: Request) {
  return Effect.gen(function* () {
    const cipher = yield* CredentialCrypto
    const encoded = fixtureCookie(request, "fixture_deletion")

    if (!encoded) return yield* fixtureError("Deletion ticket missing")

    return yield* cipher.decrypt(encoded).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(Ticket))),
      Effect.mapError(() => fixtureError("Invalid deletion ticket")),
    )
  })
}

export function deletionFixtureVerify(request: Request, config: AppConfig) {
  return Effect.gen(function* () {
    const ticket = yield* readDeletionTicket(request)

    const db = yield* DeletionDb
    const core = yield* CoreDb
    const resources = yield* WorkerResources
    const after = yield* db.fixtureSnapshot(ticket.userId, ticket.workspaceId)

    const object = yield* Effect.tryPromise({
      try: () => resources.MEDIA.head(ticket.objectKey),
      catch: () => fixtureError("R2 verification failed"),
    })

    if (
      ticket.scenario === "shared-owner" ||
      new URL(request.url).pathname.endsWith("/unchanged")
    ) {
      if (
        JSON.stringify(after) !== JSON.stringify(ticket.before) ||
        object === null
      )
        return yield* Effect.fail(
          fixtureError("Rejected deletion changed data"),
        )

      if (new URL(request.url).pathname.endsWith("/unchanged"))
        yield* db.fixtureResolveLegacyClaim(ticket.userId, ticket.workspaceId)
    } else {
      if (Object.values(after).some((value) => value !== 0) || object !== null)
        return yield* Effect.fail(fixtureError("Account purge left data"))
      const auth = yield* AuthSession

      const session = yield* auth.authenticate(
        new Request(`${config.APP_ORIGIN}/rpc`, {
          headers: { cookie: ticket.staleCookie },
        }),
      )

      if (session.user !== null)
        return yield* Effect.fail(
          fixtureError("Stale session still authenticates"),
        )
      const jobs = yield* JobService
      yield* jobs.handle({
        type: "publish",
        workspaceId: ticket.workspaceId,
        postId: ticket.postId,
        operationKey: `scheduled:${ticket.postId}`,
      })

      const queued = yield* db.fixtureSnapshot(
        ticket.userId,
        ticket.workspaceId,
      )

      if (Object.values(queued).some((value) => value !== 0))
        return yield* Effect.fail(
          fixtureError("Queued work recreated deleted data"),
        )

      if (ticket.sharedId) {
        const owner = yield* core.automationPrincipal(ticket.sharedId)
        const posts = yield* core.listPosts(ticket.sharedId, "all")

        if (
          owner.id === ticket.userId ||
          !posts.some((post) => post.content.text === "Retained shared post")
        )
          return yield* Effect.fail(fixtureError("Shared workspace data lost"))
      }
    }

    return Response.json({ verified: true })
  })
}

export function deletionFixtureSetup(
  request: Request,
  config: AppConfig,
  user: User,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const { scenario, remoteState } = yield* fixtureJson(
      request,
      Schema.Struct({
        scenario: Scenario,
        remoteState: Schema.optional(RemoteState),
      }),
    )

    const core = yield* CoreDb
    const resources = yield* WorkerResources
    const db = yield* DeletionDb
    const cipher = yield* CredentialCrypto
    const connections = yield* fixtureConnections()

    const attempt = yield* connections.begin(
      user.id,
      workspaceId,
      "x",
      "unknown",
    )

    const discovered = yield* connections.discover(
      user.id,
      workspaceId,
      attempt.attempt.id,
      attempt.attempt.state,
    )

    yield* connections.select(
      user.id,
      workspaceId,
      attempt.attempt.id,
      discovered.map((account) => account.ref.accountId),
    )
    const social = yield* SocialDb

    const claim = yield* social.claimIdempotency(
      JSON.stringify([workspaceId, "posts.publish"]),
      `deletion:${user.id}`,
      "fixture",
      ["fixture-x"],
      { tenantId: workspaceId, principalId: user.id },
    )

    yield* social.saveOutcome(
      claim.row.id,
      "fixture-x",
      JSON.stringify({ state: "not-submitted" }),
    )
    const workflowId = crypto.randomUUID()
    yield* social.createWorkflow(
      workflowId,
      "thread",
      JSON.stringify({
        backend: discovered[0]?.ref.backend,
        accountId: discovered[0]?.ref.accountId,
        stage: "failed",
      }),
      { tenantId: workspaceId, principalId: user.id },
    )
    yield* social.saveUploadSession(
      workspaceId,
      `${workspaceId}:x:fixture-x`,
      yield* cipher.encrypt("fixture-upload-session"),
    )
    yield* social.acceptInbox(
      `deletion:${user.id}`,
      "x",
      JSON.stringify({ accountIds: ["fixture-x"] }),
      [workspaceId],
    )
    const channels = yield* core.listChannels(workspaceId)
    const channel = channels[0]

    if (!channel)
      return yield* Effect.fail(fixtureError("Deletion channel missing"))
    const mediaId = crypto.randomUUID()
    const objectKey = `${workspaceId}/${mediaId}`
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
    yield* Effect.tryPromise({
      try: () => resources.MEDIA.put(objectKey, png),
      catch: () => fixtureError("Deletion media setup failed"),
    })
    yield* core.saveMedia({
      id: mediaId,
      workspaceId,
      kind: "image",
      name: "Deletion image",
      mediaType: "image/png",
      bytes: png.length,
      url: `/media/${mediaId}`,
      objectKey,
    })

    const post = yield* core.savePost(
      workspaceId,
      {
        text: "Deletion queued post",
        channelIds: [channel.id],
        mediaIds: [mediaId],
        overrides: [],
      },
      "2099-01-01T00:00:00.000Z",
    )

    yield* core.saveFeed(workspaceId, {
      name: "Deletion feed",
      url: "https://fixtures.example.test/feed",
      mode: "draft",
      channelIds: [channel.id],
      includeImages: true,
      includeVideos: true,
      enabled: true,
    })
    let sharedId: string | null = null

    if (scenario !== "sole") {
      const other = yield* core.provisionUser(config.AUTH_ISSUER, {
        id: `deletion-peer:${user.id}`,
        name: "Deletion peer",
        email: `peer-${user.id}@fixtures.example.test`,
      })

      const owner = scenario === "shared-owner" ? user : other
      const member = scenario === "shared-owner" ? other : user

      const shared = yield* core.createWorkspace(
        owner.id,
        "Deletion shared workspace",
        "organization",
        "UTC",
      )

      const invite = yield* core.invite(
        owner.id,
        shared.id,
        member.email,
        remoteState ? "admin" : "editor",
      )

      yield* core.acceptInvite(member, invite.token)
      yield* core.savePost(
        shared.id,
        {
          text: "Retained shared post",
          channelIds: [],
          mediaIds: [],
          overrides: [],
        },
        null,
      )
      sharedId = shared.id
    }

    const ticket = yield* cipher.encrypt(
      JSON.stringify({
        scenario,
        userId: user.id,
        workspaceId,
        sharedId,
        postId: post.id,
        objectKey,
        before: yield* db.fixtureSnapshot(user.id, workspaceId),
        staleCookie: request.headers.get("cookie") ?? "",
        workflowId,
      }),
    )

    return Response.json(
      { setup: true, workspaceId },
      {
        headers: {
          "set-cookie": `fixture_deletion=${ticket}; Path=/; HttpOnly; SameSite=Lax`,
        },
      },
    )
  })
}

function remoteSnapshot(ticket: typeof Ticket.Type) {
  return Effect.gen(function* () {
    if (!ticket.remote || !ticket.workflowId)
      return yield* fixtureError("Remote deletion ticket missing")
    const core = yield* CoreDb
    const social = yield* SocialDb
    const resources = yield* WorkerResources

    const ownedPostRow = yield* readRemotePostRow(resources.DB, {
      workspaceId: ticket.workspaceId,
      postId: ticket.postId,
    })

    const remotePostRow = yield* readRemotePostRow(resources.DB, {
      workspaceId: ticket.remote.workspaceId,
      postId: ticket.remote.postId,
    })

    if (!ownedPostRow || !remotePostRow)
      return yield* fixtureError("Remote post snapshot missing")

    const channel = yield* core.channel(
      ticket.remote.workspaceId,
      ticket.remote.channelId,
    )

    const ownedChannels = yield* core.listChannels(ticket.workspaceId)

    const credentials = yield* Effect.forEach(
      [channel, ...ownedChannels],
      (value) =>
        social.credential(
          credentialKey(
            value.workspaceId,
            value.backend,
            value.platform,
            value.accountId,
          ),
        ),
      { concurrency: 1 },
    )

    const grants = yield* social.grants(
      channel.workspaceId,
      channel.backend,
      channel.platform,
      channel.accountId,
    )

    const object = yield* Effect.tryPromise({
      try: () => resources.MEDIA.get(ticket.objectKey),
      catch: () => fixtureError("Remote media snapshot failed"),
    })

    if (!object) return yield* fixtureError("Remote media missing")

    const data = yield* Effect.tryPromise({
      try: () => object.arrayBuffer(),
      catch: () => fixtureError("Remote media data unavailable"),
    })

    return JSON.stringify({
      ownedPostRow,
      remotePostRow,
      ownedPost: yield* core.getPost(ticket.workspaceId, ticket.postId),
      remotePost: yield* core.getPost(
        ticket.remote.workspaceId,
        ticket.remote.postId,
      ),
      channel,
      ownedChannels,
      grants,
      credentials,
      workflow: yield* social.workflow(ticket.workflowId),
      object: {
        key: object.key,
        size: object.size,
        etag: object.etag,
        data: Array.from(new Uint8Array(data)),
      },
    })
  })
}

export function deletionRemoteFixture(
  request: Request,
  config: AppConfig,
  user: User,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const path = new URL(request.url).pathname
    const core = yield* CoreDb
    const social = yield* SocialDb

    if (path.endsWith("/remote")) {
      const { state, scope } = yield* fixtureJson(
        request,
        Schema.Struct({
          state: RemoteState,
          scope: Schema.Literals(["sole", "shared-grant"]),
        }),
      )

      const setup = yield* deletionFixtureSetup(
        new Request(request.url, {
          method: "POST",
          headers: request.headers,
          body: JSON.stringify({
            scenario: scope === "sole" ? "sole" : "shared-member",
            remoteState: state,
          }),
        }),
        config,
        user,
        workspaceId,
      )

      const ticket = yield* readDeletionTicket(
        new Request(request.url, {
          headers: { cookie: setup.headers.get("set-cookie") ?? "" },
        }),
      )

      const remoteWorkspaceId = ticket.sharedId ?? workspaceId
      let channel = (yield* core.listChannels(remoteWorkspaceId))[0]

      if (scope === "shared-grant") {
        const connections = yield* fixtureConnections()

        const started = yield* connections.begin(
          user.id,
          remoteWorkspaceId,
          "x",
          "unknown",
        )

        const accounts = yield* connections.discover(
          user.id,
          remoteWorkspaceId,
          started.attempt.id,
          started.attempt.state,
        )

        yield* connections.select(
          user.id,
          remoteWorkspaceId,
          started.attempt.id,
          accounts.map((account) => account.ref.accountId),
        )
        channel = (yield* core.listChannels(remoteWorkspaceId))[0]
      }

      if (!channel)
        return yield* fixtureError("Remote deletion channel missing")

      const remotePost = yield* core.savePost(
        remoteWorkspaceId,
        {
          text: "Remote deletion fixture",
          channelIds: [channel.id],
          mediaIds: [],
          overrides: [],
        },
        null,
      )

      if (state === "dispatching-without-result") {
        const claimed = yield* core.claimPost(
          remoteWorkspaceId,
          remotePost.id,
          `remote:${remotePost.id}`,
        )

        if (!claimed)
          return yield* fixtureError(
            "Remote dispatch fixture could not claim post",
          )
      } else {
        yield* core.saveDelivery({
          id: `${remotePost.id}:${channel.id}`,
          postId: remotePost.id,
          channelId: channel.id,
          platform: channel.platform,
          state,
          message: "Remote publication is not resolved",
          url: null,
          providerPostId: `remote:${remotePost.id}`,
          observedAt: DateTime.formatIso(yield* DateTime.now),
          retryDisposition: "reconcile-first",
        })
      }

      yield* core.setPostState(
        remoteWorkspaceId,
        remotePost.id,
        "pending",
        "Remote publication is not resolved",
      )

      const remote = {
        workspaceId: remoteWorkspaceId,
        postId: remotePost.id,
        channelId: channel.id,
        snapshotId: crypto.randomUUID(),
      }

      const complete = { ...ticket, remote }
      yield* social.createWorkflow(
        remote.snapshotId,
        "fixture-snapshot",
        yield* remoteSnapshot(complete),
        { tenantId: workspaceId, principalId: user.id },
      )
      const db = yield* DeletionDb
      const cipher = yield* CredentialCrypto

      const encoded = yield* cipher.encrypt(
        JSON.stringify({
          ...complete,
          before: yield* db.fixtureSnapshot(user.id, workspaceId),
        }),
      )

      return Response.json(
        { setup: true },
        {
          headers: {
            "set-cookie": `fixture_deletion=${encoded}; Path=/; HttpOnly; SameSite=Lax`,
          },
        },
      )
    }

    const ticket = yield* readDeletionTicket(request)

    if (!ticket.remote || ticket.userId !== user.id)
      return yield* fixtureError("Remote deletion fixture access denied")

    if (path.endsWith("/remote-unchanged")) {
      const snapshot = yield* remoteSnapshot(ticket)
      const saved = yield* social.workflow(ticket.remote.snapshotId)
      const db = yield* DeletionDb

      const counts = yield* db.fixtureSnapshot(
        ticket.userId,
        ticket.workspaceId,
      )

      if (
        snapshot !== saved ||
        JSON.stringify(counts) !== JSON.stringify(ticket.before)
      )
        return yield* fixtureError(
          "Rejected remote deletion changed rows or media",
        )

      return Response.json({ unchanged: true })
    }

    const post = yield* core.getPost(
      ticket.remote.workspaceId,
      ticket.remote.postId,
    )

    const delivery = post.deliveries.find(
      (value) => value.channelId === ticket.remote?.channelId,
    )

    const channel = yield* core.channel(
      ticket.remote.workspaceId,
      ticket.remote.channelId,
    )

    yield* core.saveDelivery({
      id: `${post.id}:${channel.id}`,
      postId: post.id,
      channelId: channel.id,
      platform: channel.platform,
      providerPostId: `remote:${post.id}`,
      observedAt: DateTime.formatIso(yield* DateTime.now),
      url: null,
      ...delivery,
      state: "published",
      message: null,
      retryDisposition: null,
    })
    yield* core.setPostState(
      ticket.remote.workspaceId,
      ticket.remote.postId,
      "published",
      null,
    )

    return Response.json({ resolved: true })
  })
}

export function deletionLegacyOtherFixture(
  request: Request,
  config: AppConfig,
  user?: User,
) {
  return Effect.gen(function* () {
    const ticket = yield* readDeletionTicket(request)
    const resources = yield* WorkerResources
    const core = yield* CoreDb

    if (new URL(request.url).pathname.endsWith("/legacy-other")) {
      if (!user || ticket.userId !== user.id)
        return yield* fixtureError("Legacy fixture access denied")
      const fixtureId = crypto.randomUUID()

      const other = yield* core.provisionUser(config.AUTH_ISSUER, {
        id: `legacy-other:${fixtureId}`,
        name: "Legacy claim owner",
        email: `legacy-${fixtureId}@fixtures.example.test`,
      })

      const legacy = { fixtureId, principalId: other.id }
      const row = yield* seedLegacyOtherClaim(resources.DB, legacy)
      const cipher = yield* CredentialCrypto

      const encoded = yield* cipher.encrypt(
        JSON.stringify({
          ...ticket,
          legacy: { ...legacy, before: JSON.stringify(row) },
        }),
      )

      return Response.json(
        { seeded: true },
        {
          headers: {
            "set-cookie": `fixture_deletion=${encoded}; Path=/; HttpOnly; SameSite=Lax`,
          },
        },
      )
    }

    if (!ticket.legacy)
      return yield* fixtureError("Legacy claim ticket missing")
    const row = yield* readLegacyOtherClaim(resources.DB, ticket.legacy)

    if (!row || JSON.stringify(row) !== ticket.legacy.before)
      return yield* fixtureError(
        "Account deletion changed foreign legacy claim",
      )

    const other = yield* core.getUser(
      config.AUTH_ISSUER,
      `legacy-other:${ticket.legacy.fixtureId}`,
    )

    if (other.id !== ticket.legacy.principalId)
      return yield* fixtureError("Foreign legacy principal changed")

    return Response.json({ retained: true })
  })
}
