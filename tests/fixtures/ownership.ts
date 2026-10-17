import { Effect, Result } from "effect"

import { DeletionDb } from "db/services/accounts/deletion"
import { CoreDb } from "db/services/client"
import type { AppConfig } from "env/server"
import type { User } from "rpc/contracts/accounts"

import { fixtureError } from "./auth"

export const ownershipFixtureGuards = Effect.fn("ownershipFixtureGuards")(
  function* (config: AppConfig, user: User) {
    const core = yield* CoreDb
    const deletion = yield* DeletionDb
    const id = crypto.randomUUID()

    const peer = yield* core.provisionUser(config.AUTH_ISSUER, {
      id: `ownership-peer:${id}`,
      name: "Ownership peer",
      email: `ownership-${id}@fixtures.example.test`,
    })

    const outsider = yield* core.provisionUser(config.AUTH_ISSUER, {
      id: `ownership-outsider:${id}`,
      name: "Ownership outsider",
      email: `ownership-outsider-${id}@fixtures.example.test`,
    })

    const workspace = yield* core.createWorkspace(
      user.id,
      "Ownership guard workspace",
      "organization",
      "UTC",
    )

    const invitation = yield* core.invite(
      user.id,
      workspace.id,
      peer.email,
      "editor",
    )

    yield* core.acceptInvite(peer, invitation.token)

    const post = yield* core.savePost(
      workspace.id,
      {
        text: "Retained ownership data",
        channelIds: [],
        mediaIds: [],
        overrides: [],
      },
      null,
    )

    for (const [requester, target, code] of [
      [user.id, user.id, "invalid-input"],
      [user.id, crypto.randomUUID(), "forbidden"],
      [user.id, outsider.id, "forbidden"],
      [peer.id, user.id, "forbidden"],
    ] as const) {
      const attempted = yield* core
        .transferOwnership(requester, workspace.id, target)
        .pipe(Effect.result)

      if (!Result.isFailure(attempted) || attempted.failure.code !== code)
        return yield* fixtureError(
          "Invalid ownership target did not return the expected failure",
        )
      const members = yield* core.members(user.id, workspace.id)
      const retained = yield* core.getPost(workspace.id, post.id)

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
        core
          .transferOwnership(user.id, workspace.id, peer.id)
          .pipe(Effect.result),
        deletion.begin(peer.id).pipe(Effect.result),
      ],
      { concurrency: 2 },
    )

    if (Result.isSuccess(transferred) === Result.isSuccess(deleting))
      return yield* fixtureError(
        "Ownership transfer and member deletion did not have one winner",
      )
    const members = yield* core.members(user.id, workspace.id)
    const retained = yield* core.listPosts(workspace.id, "all")
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
      const retried = yield* core
        .transferOwnership(user.id, workspace.id, peer.id)
        .pipe(Effect.result)

      if (!Result.isFailure(retried) || retried.failure.code !== "forbidden")
        return yield* fixtureError("Deleting target accepted ownership")
      const unchanged = yield* core.members(user.id, workspace.id)

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
