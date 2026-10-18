import { Config, Effect, Option, Schema } from "effect"

import { loadConfig } from "env/server"

const optionalNames = [
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "THREADS_CLIENT_ID",
  "THREADS_CLIENT_SECRET",
  "YOUTUBE_CLIENT_ID",
  "YOUTUBE_CLIENT_SECRET",
  "TIKTOK_CLIENT_ID",
  "TIKTOK_CLIENT_SECRET",
  "INSTAGRAM_CLIENT_ID",
  "INSTAGRAM_CLIENT_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "LINKEDIN_API_VERSION",
  "FACEBOOK_CLIENT_ID",
  "FACEBOOK_CLIENT_SECRET",
  "BLUESKY_CLIENT_ID",
  "META_API_VERSION",
  "TIKTOK_VERIFIED_MEDIA_ORIGINS",
  "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  "YOUTUBE_WEBHOOK_SECRET",
  "YOUTUBE_WEBHOOK_TOPICS",
] as const

export class InfrastructureError extends Schema.TaggedError<InfrastructureError>()(
  "InfrastructureError",
  { operation: Schema.String },
) {}

export function deploymentPassword() {
  return Config.Redacted("ALCHEMY_PASSWORD")
}

const ResourceName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  Schema.isMinLength(3),
  Schema.isMaxLength(63),
)

export function deploymentConfig(local: boolean, stage: string) {
  return Effect.gen(function* () {
    const applyFlag = yield* Config.String("SOCIAL_APPLY_MIGRATIONS").pipe(
      Config.withDefault("0"),
    )

    if (applyFlag !== "0" && applyFlag !== "1")
      return yield* Effect.fail(
        new InfrastructureError({
          operation: "Invalid SOCIAL_APPLY_MIGRATIONS flag",
        }),
      )

    const required = yield* Config.all({
      APP_ORIGIN: local
        ? Config.String("APP_ORIGIN").pipe(
            Config.withDefault("http://localhost:3200"),
          )
        : Config.String("APP_ORIGIN"),
      AUTH_CALLBACK_URL: local
        ? Config.String("AUTH_CALLBACK_URL").pipe(
            Config.withDefault("http://localhost:3200/auth/callback"),
          )
        : Config.String("AUTH_CALLBACK_URL"),
      AUTH_CLIENT_ID: Config.String("AUTH_CLIENT_ID").pipe(
        Config.withDefault("yopem"),
      ),
      SECRET_ENCRYPTION_KEY: Config.String("SECRET_ENCRYPTION_KEY"),
    })

    const optional: Partial<Record<(typeof optionalNames)[number], string>> = {}

    for (const name of optionalNames) {
      const value = yield* Config.option(Config.String(name))

      if (Option.isSome(value) && value.value !== "")
        optional[name] = value.value
    }

    const names = yield* Config.all({
      db: Config.String("DB_NAME"),
      media: Config.String("R2_BUCKET_NAME"),
      jobs: Config.String("QUEUE_NAME"),
      failedJobs: Config.String("DLQ_NAME"),
      worker: Config.String("WORKER_NAME"),
    })

    const physicalNames = yield* Schema.decodeUnknownEffect(
      Schema.Struct({
        db: ResourceName,
        media: ResourceName,
        jobs: ResourceName,
        failedJobs: ResourceName,
        worker: ResourceName,
      }),
    )({
      db: `${names.db}-${stage}`,
      media: `${names.media}-${stage}`,
      jobs: `${names.jobs}-${stage}`,
      failedJobs: `${names.failedJobs}-${stage}`,
      worker: `${names.worker}-${stage}`,
    })

    const scalars = { ...required, ...optional }
    yield* loadConfig(scalars)

    return {
      scalars,
      physicalNames,
      applyMigrations: local || applyFlag === "1",
    }
  })
}
