import alchemy from "alchemy"
import { D1Database, Queue, R2Bucket, TanStackStart } from "alchemy/cloudflare"
import { Effect, Redacted } from "effect"

import {
  deploymentConfig,
  deploymentPassword,
  InfrastructureError,
} from "env/deployment"

const password = await Effect.runPromise(deploymentPassword())

const app = await Effect.runPromise(
  Effect.tryPromise({
    try: () => alchemy("social-poster", { password: Redacted.value(password) }),
    catch: () => new InfrastructureError({ operation: "Initialize Alchemy" }),
  }),
)

// Alchemy uses AsyncLocalStorage. Restore its scope inside each Effect boundary.
export const web = await Effect.runPromise(
  Effect.tryPromise({
    try: () =>
      app.run(() =>
        Effect.runPromise(
          Effect.gen(function* () {
            const config = yield* deploymentConfig(app.local, app.stage)

            const db = yield* Effect.tryPromise({
              try: () =>
                D1Database("db", {
                  name: config.physicalNames.db,
                  delete: false,
                }),
              catch: () =>
                new InfrastructureError({ operation: "Create D1 database" }),
            })

            const media = yield* Effect.tryPromise({
              try: () =>
                R2Bucket("media", {
                  name: config.physicalNames.media,
                  delete: false,
                }),
              catch: () =>
                new InfrastructureError({ operation: "Create R2 bucket" }),
            })

            const jobs = yield* Effect.tryPromise({
              try: () => Queue("jobs", { name: config.physicalNames.jobs }),
              catch: () =>
                new InfrastructureError({ operation: "Create job queue" }),
            })

            const failedJobs = yield* Effect.tryPromise({
              try: () =>
                Queue("failed-jobs", { name: config.physicalNames.failedJobs }),
              catch: () =>
                new InfrastructureError({
                  operation: "Create dead-letter queue",
                }),
            })

            const scalars = Object.fromEntries(
              Object.entries(config.scalars).map(([name, value]) => [
                name,
                name.endsWith("_SECRET") ||
                name.endsWith("_VERIFY_TOKEN") ||
                name === "SECRET_ENCRYPTION_KEY"
                  ? alchemy.secret(value)
                  : value,
              ]),
            )

            const worker = yield* Effect.tryPromise({
              try: () =>
                TanStackStart("web", {
                  name: config.physicalNames.worker,
                  cwd: "apps/web",
                  wrangler: {
                    main: config.testMode
                      ? "../../tests/fixtures/worker.ts"
                      : "./src/worker.ts",
                  },
                  bindings: { DB: db, MEDIA: media, JOBS: jobs, ...scalars },
                  crons: ["* * * * *"],
                  eventSources: [
                    {
                      queue: jobs,
                      settings: {
                        batchSize: 10,
                        maxRetries: 3,
                        deadLetterQueue: failedJobs,
                      },
                    },
                  ],
                  assets: {
                    directory: "dist/client",
                    run_worker_first: true,
                    not_found_handling: "none",
                  },
                  observability: {
                    enabled: true,
                    logs: { enabled: true, invocationLogs: false },
                    // Automatic spans include OAuth URL queries. Enable only with redaction.
                    traces: { enabled: false },
                  },
                  build: "pnpm exec vp build",
                  dev: {
                    command: "pnpm exec vp dev",
                    domain: "localhost:3000",
                  },
                }),
              catch: () =>
                new InfrastructureError({
                  operation: "Create application Worker",
                }),
            })

            yield* Effect.tryPromise({
              try: () => app.finalize(),
              catch: () =>
                new InfrastructureError({
                  operation: "Finalize infrastructure",
                }),
            })

            return worker
          }),
        ),
      ),
    catch: () =>
      new InfrastructureError({ operation: "Run application scope" }),
  }),
)
