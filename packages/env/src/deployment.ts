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
  return Config.redacted("ALCHEMY_PASSWORD")
}

const ResourceName = Schema.String.pipe(
  Schema.pattern(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
  Schema.minLength(3),
  Schema.maxLength(63),
)

export function deploymentConfig(local: boolean, stage: string) {
  return Effect.gen(function* () {
    const testMode = yield* Config.string("SOCIAL_E2E").pipe(
      Config.withDefault("0"),
    )

    if (testMode !== "0" && testMode !== "1")
      return yield* Effect.fail(
        new InfrastructureError({ operation: "Invalid SOCIAL_E2E flag" }),
      )

    if (testMode === "1" && !local)
      return yield* Effect.fail(
        new InfrastructureError({ operation: "E2E entry requires local mode" }),
      )

    const required = yield* Config.all({
      APP_ORIGIN: local
        ? Config.string("APP_ORIGIN").pipe(
            Config.withDefault("http://localhost:3000"),
          )
        : Config.string("APP_ORIGIN"),
      AUTH_CALLBACK_URL: local
        ? Config.string("AUTH_CALLBACK_URL").pipe(
            Config.withDefault("http://localhost:3000/auth/callback"),
          )
        : Config.string("AUTH_CALLBACK_URL"),
      AUTH_CLIENT_ID: Config.string("AUTH_CLIENT_ID").pipe(
        Config.withDefault("yopem"),
      ),
      SECRET_ENCRYPTION_KEY: Config.string("SECRET_ENCRYPTION_KEY"),
    })

    const optional: Partial<Record<(typeof optionalNames)[number], string>> = {}

    for (const name of optionalNames) {
      const value = yield* Config.option(Config.string(name))

      if (Option.isSome(value) && value.value !== "")
        optional[name] = value.value
    }

    const names = yield* Config.all({
      db: Config.string("DB_NAME"),
      media: Config.string("R2_BUCKET_NAME"),
      jobs: Config.string("QUEUE_NAME"),
      failedJobs: Config.string("DLQ_NAME"),
      worker: Config.string("WORKER_NAME"),
    })

    const physicalNames = yield* Schema.decodeUnknown(
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

    return { scalars, physicalNames, testMode: testMode === "1" }
  })
}
