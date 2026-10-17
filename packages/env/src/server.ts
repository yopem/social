import type {
  D1Database,
  Fetcher,
  Queue,
  R2Bucket,
} from "@cloudflare/workers-types"

import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Predicate,
  Schema,
} from "effect"

import { ApiError } from "rpc/lib/errors"

export const JobMessage = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("publish"),
    workspaceId: Schema.String,
    postId: Schema.String,
    operationKey: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal("feed"),
    workspaceId: Schema.String,
    feedId: Schema.String,
    cursor: Schema.optional(
      Schema.Struct({
        snapshotId: Schema.String.check(Schema.isPattern(/^[a-f0-9-]{36}$/)),
        offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
        revision: Schema.String,
      }),
    ),
  }),
  Schema.Struct({
    type: Schema.Literal("reconcile"),
    workspaceId: Schema.String,
    postId: Schema.String,
  }),
])

export type JobMessage = typeof JobMessage.Type

export interface ResourceBindings {
  readonly ASSETS?: Fetcher
  readonly DB: D1Database
  readonly MEDIA: R2Bucket
  readonly JOBS: Queue<JobMessage>
}

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
  "FACEBOOK_WEBHOOK_VERIFY_TOKEN",
  "YOUTUBE_WEBHOOK_SECRET",
  "BLUESKY_CLIENT_ID",
] as const

export type WorkerBindings = ResourceBindings &
  Partial<
    Record<
      | (typeof optionalNames)[number]
      | "APP_ORIGIN"
      | "AUTH_ISSUER"
      | "AUTH_CLIENT_ID"
      | "AUTH_CALLBACK_URL"
      | "SECRET_ENCRYPTION_KEY"
      | "META_API_VERSION"
      | "TIKTOK_VERIFIED_MEDIA_ORIGINS"
      | "YOUTUBE_WEBHOOK_TOPICS",
      string
    >
  >

const OptionalSecret = Schema.optional(Schema.NonEmptyString)

export const AppConfigSchema = Schema.Struct({
  APP_ORIGIN: Schema.String,
  AUTH_ISSUER: Schema.Literal("https://auth.yopem.com"),
  AUTH_CLIENT_ID: Schema.NonEmptyString,
  AUTH_CALLBACK_URL: Schema.String,
  SECRET_ENCRYPTION_KEY: Schema.String.check(
    Schema.isPattern(/^[A-Za-z0-9+/]{43}=$/),
  ),
  X_CLIENT_ID: OptionalSecret,
  X_CLIENT_SECRET: OptionalSecret,
  THREADS_CLIENT_ID: OptionalSecret,
  THREADS_CLIENT_SECRET: OptionalSecret,
  YOUTUBE_CLIENT_ID: OptionalSecret,
  YOUTUBE_CLIENT_SECRET: OptionalSecret,
  TIKTOK_CLIENT_ID: OptionalSecret,
  TIKTOK_CLIENT_SECRET: OptionalSecret,
  INSTAGRAM_CLIENT_ID: OptionalSecret,
  INSTAGRAM_CLIENT_SECRET: OptionalSecret,
  LINKEDIN_CLIENT_ID: OptionalSecret,
  LINKEDIN_CLIENT_SECRET: OptionalSecret,
  LINKEDIN_API_VERSION: OptionalSecret,
  FACEBOOK_CLIENT_ID: OptionalSecret,
  FACEBOOK_CLIENT_SECRET: OptionalSecret,
  FACEBOOK_WEBHOOK_VERIFY_TOKEN: OptionalSecret,
  YOUTUBE_WEBHOOK_SECRET: OptionalSecret,
  YOUTUBE_WEBHOOK_TOPICS: Schema.Array(Schema.String),
  BLUESKY_CLIENT_ID: OptionalSecret,
  META_API_VERSION: Schema.NonEmptyString,
  TIKTOK_VERIFIED_MEDIA_ORIGINS: Schema.Array(Schema.String),
})

export type AppConfig = typeof AppConfigSchema.Type

export class ConfigService extends Context.Service<ConfigService, AppConfig>()(
  "social/ConfigService",
) {}

export class WorkerResources extends Context.Service<
  WorkerResources,
  ResourceBindings
>()("social/WorkerResources") {}

export function loadConfig(
  bindings: Omit<WorkerBindings, keyof ResourceBindings>,
) {
  return Effect.gen(function* () {
    const scalars = new Map<string, string>()

    for (const [key, value] of Object.entries(bindings))
      if (Predicate.isString(value) && value !== "") scalars.set(key, value)
    const provider = ConfigProvider.fromEnvRecord(Object.fromEntries(scalars))

    const values = yield* Config.all({
      APP_ORIGIN: Config.String("APP_ORIGIN"),
      AUTH_ISSUER: Config.String("AUTH_ISSUER").pipe(
        Config.withDefault("https://auth.yopem.com"),
      ),
      AUTH_CLIENT_ID: Config.String("AUTH_CLIENT_ID").pipe(
        Config.withDefault("yopem"),
      ),
      SECRET_ENCRYPTION_KEY: Config.String("SECRET_ENCRYPTION_KEY"),
      META_API_VERSION: Config.String("META_API_VERSION").pipe(
        Config.withDefault("v25.0"),
      ),
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, provider))

    const origin = yield* Effect.try({
      try: () => new URL(values.APP_ORIGIN),
      catch: () =>
        new ApiError({
          code: "not-configured",
          message: "Invalid application origin",
        }),
    })

    if (
      origin.origin !== values.APP_ORIGIN ||
      origin.username ||
      origin.password ||
      (origin.protocol !== "https:" &&
        !(
          origin.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(origin.hostname)
        ))
    )
      return yield* Effect.fail(
        new ApiError({
          code: "not-configured",
          message: "Application origin must use HTTPS or local HTTP",
        }),
      )

    const callback =
      bindings.AUTH_CALLBACK_URL ?? `${origin.origin}/auth/callback`

    if (callback !== `${origin.origin}/auth/callback`)
      return yield* Effect.fail(
        new ApiError({
          code: "not-configured",
          message: "Invalid authentication callback URL",
        }),
      )
    const optional: Partial<Record<(typeof optionalNames)[number], string>> = {}

    for (const key of optionalNames)
      if (bindings[key]) optional[key] = bindings[key]

    const origins = (bindings.TIKTOK_VERIFIED_MEDIA_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)

    for (const value of origins) {
      const parsed = yield* Effect.try({
        try: () => new URL(value),
        catch: () =>
          new ApiError({
            code: "not-configured",
            message: "Invalid verified media origin",
          }),
      })

      if (parsed.protocol !== "https:" || parsed.origin !== value)
        return yield* Effect.fail(
          new ApiError({
            code: "not-configured",
            message: "Verified media origins must use HTTPS",
          }),
        )
    }

    const topics = (bindings.YOUTUBE_WEBHOOK_TOPICS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)

    for (const value of topics) {
      const topic = yield* Effect.try({
        try: () => new URL(value),
        catch: () =>
          new ApiError({
            code: "not-configured",
            message: "Invalid YouTube webhook topic",
          }),
      })

      if (
        topic.protocol !== "https:" ||
        topic.hostname !== "www.youtube.com" ||
        topic.pathname !== "/xml/feeds/videos.xml" ||
        !topic.searchParams.get("channel_id") ||
        topic.username ||
        topic.password ||
        topic.hash ||
        topic.port
      )
        return yield* Effect.fail(
          new ApiError({
            code: "not-configured",
            message: "Use a YouTube channel feed webhook topic",
          }),
        )
    }

    return yield* Schema.decodeUnknownEffect(AppConfigSchema)({
      ...values,
      ...optional,
      AUTH_CALLBACK_URL: callback,
      TIKTOK_VERIFIED_MEDIA_ORIGINS: origins,
      YOUTUBE_WEBHOOK_TOPICS: topics,
    })
  }).pipe(
    Effect.mapError(
      () =>
        new ApiError({
          code: "not-configured",
          message: "Application configuration is invalid",
        }),
    ),
  )
}

export function configLayer(bindings: WorkerBindings) {
  return Layer.effect(ConfigService, loadConfig(bindings))
}

export function resourceLayer(bindings: ResourceBindings) {
  return Layer.succeed(WorkerResources, bindings)
}
