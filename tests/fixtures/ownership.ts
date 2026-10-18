import { Effect, Result } from "effect"

import { AccountsDb } from "db/services/accounts"
import { DeletionDb } from "db/services/accounts/deletion"
import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import type { User } from "rpc/contracts/accounts"

import { fixtureError } from "./auth"

export const ownershipFixtureGuards = Effect.fn("ownershipFixtureGuards")(
  function* (config: AppConfig, user: User) {
    const accountsDb = yield* AccountsDb
    const workspacesDb = yield* WorkspacesDb
    const postsDb = yield* PostsDb
    const deletion = yield* DeletionDb
    const id = crypto.randomUUID()

    const peer = yield* accountsDb.provisionUser({
      issuer: config.AUTH_ISSUER,
      subject: {
        id: `ownership-peer:${id}`,
        name: "Ownership peer",
        email: `ownership-${id}@fixtures.example.test`,
      },
    })

    const outsider = yield* accountsDb.provisionUser({
      issuer: config.AUTH_ISSUER,
      subject: {
        id: `ownership-outsider:${id}`,
        name: "Ownership outsider",
        email: `ownership-outsider-${id}@fixtures.example.test`,
      },
    })

    const workspace = yield* workspacesDb.createWorkspace({
      userId: user.id,
      name: "Ownership guard workspace",
      kind: "organization",
      timezone: "UTC",
    })

    const invitation = yield* workspacesDb.invite({
      userId: user.id,
      workspaceId: workspace.id,
      email: peer.email,
      role: "editor",
    })

    yield* workspacesDb.acceptInvite({ user: peer, token: invitation.token })

    const post = yield* postsDb.savePost({
      workspaceId: workspace.id,
      content: {
        text: "Retained ownership data",
        channelIds: [],
        mediaIds: [],
        overrides: [],
      },
      scheduledAt: null,
    })

    for (const [requester, target, code] of [
      [user.id, user.id, "invalid-input"],
      [user.id, crypto.randomUUID(), "forbidden"],
      [user.id, outsider.id, "forbidden"],
      [peer.id, user.id, "forbidden"],
    ] as const) {
      const attempted = yield* workspacesDb
        .transferOwnership({
          userId: requester,
          workspaceId: workspace.id,
          memberId: target,
        })
        .pipe(Effect.result)

      if (!Result.isFailure(attempted) || attempted.failure.code !== code)
        return yield* fixtureError(
          "Invalid ownership target did not return the expected failure",
        )

      const members = yield* workspacesDb.members({
        userId: user.id,
        workspaceId: workspace.id,
      })

      const retained = yield* postsDb.getPost({
        workspaceId: workspace.id,
        postId: post.id,
      })

      if (
        members.length !== 2 ||
        members.filter((member) => member.role === "owner").length !== 1 ||
        !members.some(
          (member) => member.user.id === user.id && member.role === "owner",
        ) ||
        !members.some(
          (member) => member.user.id === peer.id && member.role === "editor",
        ) ||
        retained.content.text !== "Retained ownership data"
      )
        return yield* fixtureError(
          "Invalid ownership target changed owner or data",
        )
    }

    const [transferred, deleting] = yield* Effect.all(
      [
        workspacesDb
          .transferOwnership({
            userId: user.id,
            workspaceId: workspace.id,
            memberId: peer.id,
          })
          .pipe(Effect.result),
        deletion.begin(peer.id).pipe(Effect.result),
      ],
      { concurrency: 2 },
    )

    if (Result.isSuccess(transferred) === Result.isSuccess(deleting))
      return yield* fixtureError(
        "Ownership transfer and member deletion did not have one winner",
      )

    const members = yield* workspacesDb.members({
      userId: user.id,
      workspaceId: workspace.id,
    })

    const retained = yield* postsDb.listPosts({
      workspaceId: workspace.id,
      filter: "all",
    })

    const expectedOwner = Result.isSuccess(transferred) ? peer.id : user.id
    const expectedOldRole = Result.isSuccess(transferred) ? "admin" : "owner"

    if (
      members.length !== 2 ||
      members.filter((member) => member.role === "owner").length !== 1 ||
      !members.some(
        (member) => member.user.id === expectedOwner && member.role === "owner",
      ) ||
      !members.some(
        (member) =>
          member.user.id === user.id && member.role === expectedOldRole,
      ) ||
      retained.length !== 1 ||
      retained[0]?.id !== post.id ||
      retained[0].content.text !== "Retained ownership data"
    )
      return yield* fixtureError("Ownership race changed owner or data")

    if (Result.isFailure(transferred)) {
      const retried = yield* workspacesDb
        .transferOwnership({
          userId: user.id,
          workspaceId: workspace.id,
          memberId: peer.id,
        })
        .pipe(Effect.result)

      if (!Result.isFailure(retried) || retried.failure.code !== "forbidden")
        return yield* fixtureError("Deleting target accepted ownership")

      const unchanged = yield* workspacesDb.members({
        userId: user.id,
        workspaceId: workspace.id,
      })

      if (
        !unchanged.some(
          (member) => member.user.id === user.id && member.role === "owner",
        ) ||
        unchanged.filter((member) => member.role === "owner").length !== 1
      )
        return yield* fixtureError("Deleting target removed workspace owner")
      yield* deletion.finish(peer.id)
    }

    return Response.json({
      invalidTargetsProtected: true,
      raceProtected: true,
      owners: 1,
      retainedPosts: 1,
    })
  },
)
