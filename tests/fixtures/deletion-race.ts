import { Effect, Result } from "effect"

import { DeletionDb } from "db/services/accounts/deletion"
import { CoreDb } from "db/services/client"
import type { AppConfig } from "env/server"
import type { User } from "rpc/contracts/accounts"

import { fixtureError } from "./auth"

export function deletionInvitationRace(
  config: AppConfig,
  user: User,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const core = yield* CoreDb
    const deletion = yield* DeletionDb

    const peer = yield* core.provisionUser(config.AUTH_ISSUER, {
      id: `race-peer:${user.id}`,
      name: "Race peer",
      email: `race-${user.id}@fixtures.example.test`,
    })

    const post = yield* core.savePost(
      workspaceId,
      {
        text: "Retained race post",
        channelIds: [],
        mediaIds: [],
        overrides: [],
      },
      null,
    )

    const invite = yield* core.invite(
      user.id,
      workspaceId,
      peer.email,
      "editor",
    )

    const [accepted, frozen] = yield* Effect.all(
      [
        core.acceptInvite(peer, invite.token).pipe(Effect.result),
        deletion.begin(user.id).pipe(Effect.result),
      ],
      { concurrency: 2 },
    )

    if (Result.isSuccess(accepted) === Result.isSuccess(frozen))
      return yield* Effect.fail(
        fixtureError("Invite and deletion did not have one winner"),
      )
    const snapshot = yield* deletion.fixtureSnapshot(user.id, workspaceId)
    const retained = yield* core.getPost(workspaceId, post.id)

    if (
      snapshot.posts !== 1 ||
      snapshot.workspaces !== 1 ||
      retained.content.text !== "Retained race post"
    )
      return yield* Effect.fail(fixtureError("Race deleted workspace data"))

    if (Result.isSuccess(accepted)) {
      const members = yield* core.members(user.id, workspaceId)

      if (
        snapshot.fences !== 0 ||
        !members.some((member) => member.user.id === peer.id)
      )
        return yield* Effect.fail(
          fixtureError("Accepted member or unfenced workspace missing"),
        )
    } else if (snapshot.fences !== 1)
      return yield* Effect.fail(
        fixtureError("Deletion winner did not fence workspace"),
      )

    return Response.json({ protected: true })
  })
}
