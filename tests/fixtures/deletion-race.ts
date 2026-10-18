import { Effect, Result } from "effect"

import { AccountsDb } from "db/services/accounts"
import { DeletionDb } from "db/services/accounts/deletion"
import { PostsDb } from "db/services/posts"
import { WorkspacesDb } from "db/services/workspaces"
import type { AppConfig } from "env/server"
import type { User } from "rpc/contracts/accounts"

import { fixtureError } from "./auth"

export function deletionInvitationRace(
  config: AppConfig,
  user: User,
  workspaceId: string,
) {
  return Effect.gen(function* () {
    const accountsDb = yield* AccountsDb
    const postsDb = yield* PostsDb
    const workspacesDb = yield* WorkspacesDb
    const deletion = yield* DeletionDb

    const peer = yield* accountsDb.provisionUser({
      issuer: config.AUTH_ISSUER,
      subject: {
        id: `race-peer:${user.id}`,
        name: "Race peer",
        email: `race-${user.id}@fixtures.example.test`,
      },
    })

    const post = yield* postsDb.savePost({
      workspaceId,
      content: {
        text: "Retained race post",
        channelIds: [],
        mediaIds: [],
        overrides: [],
      },
      scheduledAt: null,
    })

    const invite = yield* workspacesDb.invite({
      userId: user.id,
      workspaceId,
      email: peer.email,
      role: "editor",
    })

    const [accepted, frozen] = yield* Effect.all(
      [
        workspacesDb
          .acceptInvite({ user: peer, token: invite.token })
          .pipe(Effect.result),
        deletion.begin(user.id).pipe(Effect.result),
      ],
      { concurrency: 2 },
    )

    if (Result.isSuccess(accepted) === Result.isSuccess(frozen))
      return yield* Effect.fail(
        fixtureError("Invite and deletion did not have one winner"),
      )
    const snapshot = yield* deletion.fixtureSnapshot(user.id, workspaceId)
    const retained = yield* postsDb.getPost({ workspaceId, postId: post.id })

    if (
      snapshot.posts !== 1 ||
      snapshot.workspaces !== 1 ||
      retained.content.text !== "Retained race post"
    )
      return yield* Effect.fail(fixtureError("Race deleted workspace data"))

    if (Result.isSuccess(accepted)) {
      const members = yield* workspacesDb.members({
        userId: user.id,
        workspaceId,
      })

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
