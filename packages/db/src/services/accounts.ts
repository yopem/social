import { sql, eq, and, gt, isNull } from "drizzle-orm"
import { Context, Effect, Layer, Schema } from "effect"

import {
  users,
  authAttempts,
  AuthAttempt,
  ConsumedAuthAttempt,
  UserRow,
} from "db/schema/accounts"
import { workspaces, memberships } from "db/schema/workspaces"
import { Database } from "db/services/client"
import type { DatabaseContext } from "db/services/context"
import { failure, now } from "db/services/context"
import { validateOperation } from "db/services/validation"
import { User } from "rpc/contracts/accounts"

const AccountIdentityInput = Schema.Struct({
  issuer: Schema.String,
  subjectId: Schema.String,
})

const AccountProvisionInput = Schema.Struct({
  issuer: Schema.String,
  subject: Schema.Struct({
    id: Schema.String,
    email: Schema.String,
    name: Schema.NullOr(Schema.String),
  }),
})

const AuthAttemptConsumeInput = Schema.Struct({
  state: Schema.String,
  nonceHash: Schema.String,
})

export class AccountsDb extends Context.Service<
  AccountsDb,
  ReturnType<typeof createIdentityRepository>
>()("social/AccountsDb") {
  static readonly layer = Layer.effect(
    AccountsDb,
    Effect.map(Database, createIdentityRepository),
  )
}

export function createIdentityRepository(context: DatabaseContext) {
  const { client, query, batch } = context

  function getUser({ issuer, subjectId }: typeof AccountIdentityInput.Type) {
    return query(UserRow, () =>
      client
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(eq(users.issuer, issuer), eq(users.subject_id, subjectId))),
    ).pipe(Effect.map((rows) => rows[0] ?? null))
  }

  const accountOperations = {
    getUser,
    provisionUser: Effect.fn("accounts.provisionUser")(function* ({
      issuer,
      subject,
    }: typeof AccountProvisionInput.Type) {
      const subjectName = subject.name?.trim() ?? ""

      const user = yield* Schema.decodeUnknownEffect(User)({
        id: crypto.randomUUID(),
        name: subjectName.length > 0 ? subjectName : subject.email,
        email: subject.email,
      }).pipe(Effect.mapError(() => failure("invalid-input", "Invalid user")))

      const workspaceId = crypto.randomUUID()
      yield* batch([
        client
          .insert(users)
          .values({
            id: user.id,
            issuer,
            subject_id: subject.id,
            name: user.name,
            email: user.email,
            initial_workspace_id: workspaceId,
          })
          .onConflictDoUpdate({
            target: [users.issuer, users.subject_id],
            set: { name: user.name, email: user.email },
          }),
        client
          .insert(workspaces)
          .select(
            client
              .select({
                id: users.initial_workspace_id,
                name: users.name,
                kind: sql<string>`'personal'`.as("kind"),
                timezone: sql<string>`'UTC'`.as("timezone"),
              })
              .from(users)
              .where(
                and(eq(users.issuer, issuer), eq(users.subject_id, subject.id)),
              ),
          )
          .onConflictDoNothing(),
        client
          .insert(memberships)
          .select(
            client
              .select({
                workspace_id: users.initial_workspace_id,
                user_id: users.id,
                role: sql<string>`'owner'`.as("role"),
              })
              .from(users)
              .where(
                and(eq(users.issuer, issuer), eq(users.subject_id, subject.id)),
              ),
          )
          .onConflictDoNothing(),
      ])
      const saved = yield* getUser({ issuer, subjectId: subject.id })

      if (saved === null)
        return yield* Effect.fail(
          failure("storage-failure", "User provisioning failed"),
        )

      return saved
    }),
    saveAuthAttempt: Effect.fn("accounts.saveAuthAttempt")(function* (
      value: typeof AuthAttempt.Type,
    ) {
      const stamp = yield* now()

      return yield* Schema.decodeUnknownEffect(AuthAttempt)(value).pipe(
        Effect.mapError(() => failure("invalid-input", "Invalid auth attempt")),
        Effect.flatMap((row) =>
          batch([
            client
              .delete(authAttempts)
              .where(
                sql`state IN (SELECT state FROM auth_attempts WHERE expires_at<${stamp} ORDER BY expires_at LIMIT 100)`,
              ),
            client.insert(authAttempts).values({
              state: row.state,
              nonce_hash: row.nonceHash,
              verifier: row.verifier,
              expires_at: row.expiresAt,
            }),
          ]),
        ),
      )
    }),
    consumeAuthAttempt: Effect.fn("accounts.consumeAuthAttempt")(function* ({
      state,
      nonceHash,
    }: typeof AuthAttemptConsumeInput.Type) {
      const stamp = yield* now()

      return yield* query(ConsumedAuthAttempt, () =>
        client
          .update(authAttempts)
          .set({ consumed_at: stamp })
          .where(
            and(
              eq(authAttempts.state, state),
              eq(authAttempts.nonce_hash, nonceHash),
              gt(authAttempts.expires_at, stamp),
              isNull(authAttempts.consumed_at),
            ),
          )
          .returning({ verifier: authAttempts.verifier }),
      ).pipe(
        Effect.flatMap((rows) =>
          rows[0]
            ? Effect.succeed(rows[0])
            : Effect.fail(
                failure("invalid-input", "Invalid or expired OAuth state"),
              ),
        ),
      )
    }),
  }

  return {
    getUser: validateOperation(
      accountOperations.getUser,
      Schema.Tuple([AccountIdentityInput]),
    ),
    provisionUser: validateOperation(
      accountOperations.provisionUser,
      Schema.Tuple([AccountProvisionInput]),
    ),
    saveAuthAttempt: validateOperation(
      accountOperations.saveAuthAttempt,
      Schema.Tuple([AuthAttempt]),
    ),
    consumeAuthAttempt: validateOperation(
      accountOperations.consumeAuthAttempt,
      Schema.Tuple([AuthAttemptConsumeInput]),
    ),
  }
}
