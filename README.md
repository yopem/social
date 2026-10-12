# Yopem Social

A workspace-based social publishing app. It supports drafts, media uploads,
scheduled posts, delivery results, RSS automation, and available platform
analytics.

The app uses direct Social SDK adapters for X, Threads, Bluesky, YouTube,
TikTok, Instagram, and LinkedIn. A direct Meta Graph API adapter supports
Facebook Pages text, links, and single images. Platform permissions and API
access determine which features are available.

## Stack

- React 19, TanStack Start, Query, and Form
- Effect 4.0.3 services, Effect RPC, and Effect Schema validation
- Drizzle ORM on Cloudflare D1, with Drizzle Kit and Drizzle Studio
- Yopem UI and StyleX
- Cloudflare R2, Queues, and one application Worker
- Alchemy infrastructure and Vite+ tooling

## Local setup

Use Node.js 24 LTS and pnpm 12.11.2.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
```

Set `ALCHEMY_PASSWORD` and `SECRET_ENCRYPTION_KEY` in `.env`. The encryption
key must contain 32 random bytes encoded as base64. Keep both values private
and stable. Changing a key can make stored credentials or infrastructure
state unreadable.

Use `http://localhost:3200` for the local app and its callback origin. Keep
platform credentials empty until you have approved developer access. Missing
credentials show setup requirements, not simulated publication.

```sh
pnpm exec vp run dev
```

The live sign-in flow uses the configured external issuer at
`https://auth.yopem.com`. Do not run another issuer in this project.

## Checks

Build once after installation to generate the route tree. Do not edit the
generated route tree.

```sh
pnpm exec vp run build
pnpm exec vp run check
```

The project also provides `format`, `lint`, `typecheck`, and `e2e` scripts.
Run project scripts through `pnpm exec vp run <script>`.

## Database

Drizzle tables and Effect row schemas live together in
`packages/db/src/schema/`. Database services own queries and mutations.
Effect Schema validates input and returned data at that boundary.

After a table change, generate and review a migration:

```sh
pnpm exec vp run db-generate
```

Keep generated migration metadata with the SQL. Do not rewrite applied
migrations, reset a shared database, or use schema push as a release step.
Alchemy owns D1 migration application. Local migrations run before Worker
startup. Remote migrations are off unless `SOCIAL_APPLY_MIGRATIONS=1`. Confirm
the target before using that flag or deploying. A populated legacy database
needs reviewed baseline adoption; do not replay its CREATE statements.

To inspect a local database:

```sh
pnpm exec vp run db-studio
```

Studio selects only this project's local D1 files. If more than one database
exists, set `DRIZZLE_LOCAL_D1_PATH` to the exact intended file in private local
configuration. Studio binds to `127.0.0.1:4983`. Studio edits bypass application
validation; use validated app operations or reviewed migrations to change data.

## Browser tests

Tests use isolated local Cloudflare resources and repeatable fixtures. They
must not use production accounts or production resources.

Create a private `.env.e2e` from `.env.example`. Set local encryption credentials
and `SOCIAL_E2E=1`. Keep all live social credentials empty. Install Chromium:

```sh
pnpm exec playwright install chromium
```

Start the isolated test Worker on port 3200. Use a separate stage from normal
local development and from legacy fixture databases:

```sh
pnpm exec vp run dev --stage e2e-drizzle --env-file .env.e2e
```

In another terminal:

```sh
pnpm exec vp run e2e
```

Tests require Alchemy migrations to complete before fixture readiness succeeds.
Test reports, traces, and screenshots are saved in `test-results/`. Fixture
routes and simulated platform responses must not appear in production builds.

## Privacy and account deletion

Public legal pages are `/tos` and `/privacy-policy`. They use the confirmed
public origin `https://social.yopem.com` and contact `support@yopem.com`.

Account deletion removes the app account and sole-member workspaces. An owner
must transfer ownership of shared workspaces first. Shared content remains
with its workspace. App deletion does not delete external sign-in accounts,
remote social accounts, or posts already sent to a platform. Publication that
is in progress or uncertain must be resolved before account deletion.

Disconnecting a channel, signing out, and deleting an account are different
operations. Revoke provider access through the provider's own account settings
when needed.

Scheduled cleanup removes expired sessions and sign-in state within 24 hours
during normal operation. Completed webhook records remain for seven days.
Active content and unresolved publication state are not removed by cleanup.

An interrupted operation can leave a durable lease that blocks deletion.
Operators must stop the Worker and jobs and confirm that no work is in flight
before using `recoverAccountOperations` with exact lease tokens and the
`WORKER_AND_JOBS_STOPPED` confirmation. Never clear leases through Studio or
an automatic expiry rule.

## Deployment

Deploy only after checks, migrations, and local browser tests pass. Confirm the
Cloudflare account, stage, resource changes, and migration target first. The
Alchemy program declares one application Worker with its assets, API, auth,
queue, and scheduled handlers. No separate API server is deployed.

Legal pages require public HTTPS deployment before developer consoles can
fetch them. Review legal text and each platform's access rules before submitting
an application for approval. Local tests do not verify live OAuth or publishing.
