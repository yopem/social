# Agent Instructions

## Scope and priority

- Read the closest project-specific `AGENTS.md` before changing code.
- If a user asks to update `AGENTS.md` only, edit only `AGENTS.md`. Do not
  change source files, dependencies, lockfiles, or generated files.
- Before code search, use Code Index MCP (`code-index-mcp`). Select the project
  with `set_project_path` and check `get_settings_info`.
- Keep its file watcher off. Set `enabled: false` with `configure_file_watcher`,
  select the same project again, and verify `active: false` with
  `get_file_watcher_status` before building a deep index.
- Use `search_code_advanced` and `find_files` for code context. Follow pagination
  with `start_index` when `has_more` is true. Use `refresh_index` for a stale
  file index.
- Build a deep index only when symbol data is needed, with `max_workers: 1`.
  Use `get_file_summary` and `get_symbol_body` for focused symbol context.
- If required files are absent from the index or the server is unavailable,
  use native search and state the reason.
- Inspect existing callers, types, tests, and configuration before editing.
- Make the smallest complete change. Reuse existing code before adding helpers,
  abstractions, dependencies, or configuration.
- Preserve unrelated user changes. Never reset, delete, or overwrite them.
- Only `AGENTS.md`, `README.md`, and `LICENSE.md` may be committed as Markdown
  files in application repositories. Put detailed plans and working documents
  in gitignored `docs/`. Keep `README.md` focused on project overview, setup,
  usage, and license.
- Preserve the project's license. Do not add or change a license without an
  explicit request.

## General scope

- These instructions define a reusable stack, not a product specification.
- Get product requirements, roles, integrations, and release scope from the
  current project and user request. Do not assume a product domain, login
  method, subject fields, or client identifier.
- Add optional services and dependencies only when the requested feature needs
  them. Do not add AI, email, storage, or background jobs in advance.
- Keep the existing repository layout unless the task requires a change.

## Standard stack

- **Local runtime and package manager:** Node.js LTS, pnpm workspaces, and ESM.
  Use a Node.js version supported by Vite+, Alchemy, and the UI CLI. Keep pnpm
  as the selected package manager when Vite+ manages package commands.
- **Production runtime:** Cloudflare Workers (`workerd`), not a Node.js server.
  Enable `nodejs_compat` only when a dependency needs supported Node.js APIs.
- **Language:** TypeScript with `@yopem/typescript-config`.
- **Application foundation:** Effect v4 or the latest release with a major
  version of 4 or higher from https://effect.website. Never use Effect v3 or
  earlier. Use Effect for domain logic, typed errors, services, dependency
  injection, concurrency, retries, timeouts, resource management, logging,
  and tracing.
- **Frontend:** React 19, TanStack Start, TanStack Router, TanStack Query, and
  TanStack Form (`@tanstack/react-form`). Use TanStack Table and TanStack Virtual
  only when needed. Keep these frontend tools; Effect does not replace React,
  framework routing, query state, forms, tables, or list virtualization.
- **Styling and UI:** StyleX and Yopem UI from https://ui.yopem.com. Use
  `@yopem-ui/cli` to install source-owned components built on Base UI. Use
  `@yopem-ui/oxlint-plugin` to check component and StyleX usage.
- **Development tooling:** Vite+ from https://viteplus.dev for development,
  builds, Oxlint, Oxfmt, tests, cached tasks, and Git hooks. Use
  `@yopem/oxlint-config` for shared lint policy.
- **Backend and client contract:** Effect RPC with Effect Schema. Use Effect
  HTTP APIs for transport and non-RPC handlers. Do not use Hono or Hono RPC.
- **Database:** Cloudflare D1 (SQLite) through Drizzle ORM's D1 adapter.
  Use Drizzle ORM for all database queries, mutations, batches, seeds, and
  maintenance operations. Use Effect Schema to validate operation inputs,
  stored rows, and outputs at data-access boundaries. Use Drizzle Kit for
  migration generation and Drizzle Studio for database inspection.
- **Authentication, when needed:** OpenAuth from https://openauth.js.org with
  the existing external issuer at `https://auth.yopem.com`. Use its client behind
  Effect services. Preserve the application's session contract; do not deploy
  another issuer or embed an auth server in the application Worker.
- **Cache:** Cloudflare caching APIs for HTTP responses. Use Workers KV for
  read-heavy data that permits eventual consistency. Use Durable Objects when
  shared state needs strong coordination.
- **Storage and media:** Cloudflare R2 bindings for objects; Cloudflare Images
  for supported image transformations. Do not install a native image runtime.
- **Background work:** Cloudflare Queues and Cron Triggers. Add Cloudflare
  Workflows only when durable multi-step execution is required.
- **AI, when requested:** use Effect AI for model calls, streaming, structured
  output, and tools. Prefer Workers AI as the inference service. Use a compatible
  Effect AI provider or a small provider adapter for the Workers AI binding.
  Add Vectorize or AI Search only for a stated retrieval need. Do not use
  TanStack AI, Vercel AI SDK, or another AI application library.
- **Email:** Cloudflare Email Service when available for the target account.
  Verify account access and delivery requirements before adding email.
- **Validation and configuration:** Effect Schema, Effect Config, and typed
  Cloudflare bindings exposed through `packages/env`.
- **Infrastructure as code:** Alchemy from https://alchemy.run. Define the
  complete deployment in TypeScript, not hand-written Worker configuration.

Use Node.js and pnpm for local tools, scripts, and package management. Use Vite+
for the local toolchain and preserve the required TanStack Start, StyleX, and
Cloudflare build plugins. Node.js is not the deployed HTTP server. Do not use
Bun or Bun-specific APIs. Select a Node.js-compatible `@yopem-ui/cli` release.

Pin compatible Effect, Drizzle ORM, Drizzle Kit, and Alchemy versions. Read
documentation for the pinned versions before selecting APIs. Use the Node.js
platform adapter only in local scripts; keep it out of Worker and browser
bundles.

## Effect version policy

- Before setup or an upgrade, check the official Effect release information
  and package registry. Select the latest release with a major version of 4
  or higher. If v4 is available only as a prerelease, use the latest v4
  prerelease. Do not assume the registry's `latest` tag points to v4 or higher.
- Pin the selected version. Keep all Effect packages and integrations compatible
  with that release. Do not mix Effect major versions or imports from different
  releases.
- Never install, recommend, or write code for Effect v3 or earlier. This rule
  applies to dependencies, imports, APIs, examples, tests, and generated code.
- Read official documentation and migration guidance for the selected release
  before writing code. Do not copy v3 APIs or package paths from old tutorials,
  search results, or model memory. Verify each API and import against that
  release.
- If an existing project uses Effect v3 or earlier, report the conflict and
  obtain approval for migration before writing Effect code. Do not extend the
  old implementation or silently downgrade to satisfy an integration.
- If a required integration does not support v4 or higher, report the blocker.
  Do not use v3 or earlier as a fallback.

## Repository layout

For a new monorepo, use this layout when needed. For an existing project, map
all paths below to its current modules. File names show responsibilities, not
required empty files. Do not create unused packages or optional folders:

```text
.
├── AGENTS.md                      project-specific agent rules
├── README.md                      overview, setup, usage, and license
├── LICENSE.md                     existing project license
├── .gitignore                     secrets, output, and local state
├── package.json                   root scripts and tooling dependencies
├── pnpm-workspace.yaml            workspace packages and pnpm settings
├── pnpm-lock.yaml                 shared dependency lockfile
├── tsconfig.json                  shared TypeScript config and paths
├── vite.config.ts                 lint, fmt, test, run, and staged settings
├── alchemy.run.ts                 resources and single Worker deployment
├── apps/
│   ├── web/                       frontend and deployed Worker assembly
│   │   ├── package.json           frontend dependencies and scripts
│   │   ├── tsconfig.json          shared React preset and local paths
│   │   ├── vite.config.ts         framework, StyleX, and runtime plugins
│   │   ├── public/                static assets served by the same Worker
│   │   └── src/
│   │       ├── worker.ts          RPC, SSR, auth, queue, and Cron assembly
│   │       ├── router.tsx         TanStack Router and query context
│   │       ├── routeTree.gen.ts   generated route tree; ignored
│   │       ├── routes/            route files and thin page composition
│   │       │   ├── __root.tsx     document shell and shared providers
│   │       │   └── index.tsx      application's main route
│   │       ├── features/
│   │       │   └── <domain>/      one folder per business domain
│   │       │       ├── components/ domain UI and forms
│   │       │       ├── hooks/     domain behavior and form hooks
│   │       │       ├── queries.ts RPC-backed query and mutation options
│   │       │       └── schema.ts  UI-only Effect schemas when needed
│   │       ├── components/       shared application components
│   │       ├── lib/              query client and browser RPC setup
│   │       └── styles/           application styles and root CSS
│   └── server/                    source-only backend; no deployment
│       ├── package.json           server dependencies and source exports
│       ├── tsconfig.json          shared base preset and runtime types
│       └── src/
│           ├── index.ts           handler and service Layer assembly
│           ├── features/
│           │   └── <domain>/      one folder per business domain
│           │       ├── rpc.ts     domain RPC handler implementations
│           │       ├── service.ts business operations when needed
│           │       ├── errors.ts  server-only domain errors when needed
│           │       ├── http.ts    domain HTTP handlers when needed
│           │       └── jobs.ts    domain queue and scheduled work if needed
│           ├── platform/          shared server infrastructure
│           │   ├── auth.ts        request identity and auth HTTP handlers
│           │   ├── storage.ts     optional shared R2 and media adapter
│           │   └── ai.ts          optional Effect AI provider adapter
│           └── scripts/           optional local maintenance scripts
├── packages/
│   ├── db/
│   │   ├── package.json           Drizzle dependencies, migration/Studio tasks
│   │   ├── tsconfig.json          shared base preset
│   │   ├── drizzle.config.ts      Drizzle Kit and Studio configuration
│   │   └── src/
│   │       ├── schema/            Drizzle tables and Effect Schema contracts
│   │       │   └── <domain>.ts    tables, indexes, constraints, and validation
│   │       ├── services/          all runtime database access
│   │       │   ├── client.ts      Drizzle D1 client and Effect Layer
│   │       │   └── <domain>.ts    queries, mutations, and atomic batches
│   │       └── migrations/        reviewed Drizzle Kit migration output
│   │           ├── <migration>.sql versioned schema or data migration
│   │           └── meta/          generated metadata when emitted by Kit
│   ├── auth/                      OpenAuth client and session support
│   │   ├── package.json           server-only client and subject exports
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── client.ts          configured OpenAuth client
│   │       ├── subjects.ts        Effect schemas matching issuer subjects
│   │       └── services/          verification, token, and session services
│   ├── rpc/
│   │   ├── package.json           browser-safe contract and client exports
│   │   ├── tsconfig.json          shared base preset
│   │   └── src/
│   │       ├── contracts/         domain Rpc and RpcGroup definitions
│   │       ├── middleware.ts      shared RPC middleware contracts
│   │       └── client.ts          typed client and transport setup
│   ├── ui/
│   │   ├── package.json           UI dependencies and source exports
│   │   ├── tsconfig.json          shared React preset
│   │   ├── ui.json                Yopem UI CLI file record
│   │   └── src/
│   │       ├── components/        CLI-installed and shared UI components
│   │       ├── lib/               required UI helpers
│   │       └── styles/
│   │           └── tokens.stylex.ts shared semantic design tokens
│   ├── utils/                     optional shared domain helpers
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/                   concrete ID, date, and helper modules
│   ├── env/
│   │   ├── package.json           separate server and public exports
│   │   ├── tsconfig.json          shared base preset and binding types
│   │   └── src/
│   │       ├── server.ts          typed Worker bindings and Effect config
│   │       └── client.ts          approved public configuration only
│   └── cache/                     optional HTTP cache and KV services
│       ├── package.json
│       ├── tsconfig.json
│       └── src/                   cache policies, services, and Layers
├── tests/
│   ├── e2e/                       real browser and Worker workflows
│   └── fixtures/                  repeatable inputs and local test data
├── test-results/                  generated test artifacts; ignored
└── docs/                          local plans and working notes; ignored
```

Use a feature-first modular monolith. Keep one application with clear domain
boundaries. Do not create separate deployments or workspace packages per feature.
The table below defines ownership; the tree shows starting paths.

| Location                               | Responsibility                                     |
| -------------------------------------- | -------------------------------------------------- |
| `apps/web/src/routes/`                 | URL handling and page composition                  |
| `apps/web/src/features/<domain>/`      | Domain UI, hooks, and query options                |
| `apps/web/src/components/`             | Shared application UI                              |
| `apps/server/src/features/<domain>/`   | Domain handlers and business rules                 |
| `apps/server/src/platform/`            | Shared request and runtime adapters                |
| `packages/db/src/schema/<domain>.ts`   | Related tables and persistence validation          |
| `packages/db/src/services/<domain>.ts` | Queries, writes, and atomic batches                |
| `packages/rpc/`                        | Browser-safe RPC contracts and client              |
| `packages/auth/`                       | OpenAuth client and session operations when needed |
| `packages/ui/`                         | Shared UI primitives and theme                     |
| `packages/env/`                        | Typed server and public configuration              |

- Put domain code in `apps/web/src/features/<domain>/` and
  `apps/server/src/features/<domain>/`.
- Name folders after business domains. Use database names when they match the
  domain. Group related tables under one domain; do not create a module for
  each table. For example, documents, versions, and shares belong to `documents`.
- Use the same domain name across web, server, RPC contracts, and database
  modules when they have the same owner. Do not require each domain to have
  code in every package.
- Keep domain UI, hooks, and queries together. Keep routes thin. Put shared
  application UI in `apps/web/src/components/` and UI primitives in `packages/ui`.
- Keep schemas in their owning package. Public RPC schemas belong in
  `packages/rpc/src/contracts/<domain>.ts`; persistence schemas belong in
  `packages/db/src/schema/<domain>.ts`. Do not copy them into web modules.
- Start with flat domain files. Create only files needed by the task. Do not
  add empty layers or forwarding-only services. Use the growth rules below.
- Configure the framework and Alchemy to use the custom Worker entrypoint.
  Preserve existing entrypoint names when they differ from `worker.ts`.
- Keep CLI-generated UI paths consistent with `ui.json` and the build aliases.
  Initialize the workspace that owns the components; do not duplicate them.
- Workspace Vite configs do not own separate lint or format policies. Keep
  those settings in the root `vite.config.ts`.
- `apps/server` is a source package. It has no separate deployed server,
  Worker, public port, or service binding to the frontend.

## Growth rules

Start with files. Split a domain into focused modules when separate
responsibilities become hard to follow. Do not use a fixed line-count limit.
Keep domain ownership and import boundaries unchanged.

```text
Small:
apps/server/src/features/documents/service.ts
packages/db/src/schema/documents.ts
packages/db/src/services/documents.ts

Larger, only when needed:
apps/server/src/features/documents/services/create-document.ts
apps/server/src/features/documents/services/share-document.ts
packages/db/src/schema/documents/documents.ts
packages/db/src/schema/documents/versions.ts
packages/db/src/schema/documents/shares.ts
packages/db/src/services/documents/reads.ts
packages/db/src/services/documents/writes.ts
```

- Split frontend components, hooks, and query modules by responsibility in the
  same way. Do not create a folder for each operation in advance.
- When splitting a file, update callers, tests, package exports, and schema
  discovery in Drizzle configuration. Use concrete module paths. Do not keep
  a re-export-only barrel at the old path.
- Extract a shared package only for clear ownership, runtime isolation, or
  actual reuse. Do not create packages to match every domain folder.
- Add auth, cache, storage, AI, and job modules only when required. Existing
  packages stay in place; do not remove them as part of an unrelated task.

## Architecture boundaries

Request flow; the Worker routes RPC requests before frontend rendering:

```text
Simple CRUD:       browser → RPC handler → database service → D1
Business workflow: browser → RPC handler → feature service → database/adapters
```

Import direction is separate from request flow:

```text
Browser          → browser-safe RPC contracts/client
Worker assembly  → backend handlers and Layers
Server feature   → database services and infrastructure adapters
Database service → schema modules and database client
```

Shared contracts never import server implementations.

- Browser code calls the typed Effect RPC client. Browser code never imports
  SQL clients, D1 bindings, database services, or server implementation modules.
- The web Worker's server-only entrypoint imports the backend handlers to build
  one application. Keep this import out of client bundles.
- All database access lives in `packages/db/src/services/`.
- Group related Drizzle tables, including join tables, in
  `packages/db/src/schema/<domain>.ts`. Keep their indexes, constraints, and
  Effect input, row, and output schemas in the same module. For example,
  `documents.ts` owns documents, document versions, and document shares.
  Start with one file per domain, not per table. Split within the domain as
  described in Growth rules. Do not separate tables from their validation.
- Keep data access domain-based in `packages/db/src/services/<domain>.ts`.
  Services may use several domain schema modules for joins and atomic batches.
  Keep operation-specific input and result schemas with the owning service
  when they span domains. Keep generated SQL migrations and metadata in
  `src/migrations/`.
- Define domain schemas with Effect Schema and infer domain types from them.
  Use Drizzle's inferred types for database operations. Validate operation
  inputs before execution and decode selected or returned rows with Effect
  Schema before they leave the data-access service. Validate mutation values
  even when the operation returns no rows. Model database failures as typed
  Effect errors. Do not use `drizzle-zod` or a second validation library.
- Reuse the project's ID helper when present. Otherwise, use a platform API
  that meets the required ID format; do not add a helper package in advance.
- Keep handlers thin. A handler may call a database service directly only
  when it needs request validation, identity and permission checks, and one
  persistence operation. Enforce permissions before protected operations.
  One persistence operation means one database service call; that call may
  use an atomic database batch, not just one SQL statement.
- If an operation adds business decisions, multiple steps, or logic shared
  by another entrypoint, move that logic into a feature service. Do not add
  a service that only forwards arguments. Use Effect for business logic.
- Keep reusable domain permissions in the owning feature. Call the same checks
  from RPC, HTTP, jobs, and scripts when they perform protected operations.
- Keep SQL and atomic database batches in database services. Keep business
  workflows in feature services, not database services.
- Cross-domain calls use the owning domain's service module, not its RPC,
  HTTP, or job handlers. Keep domain dependencies directional and acyclic.
- Put multi-domain workflows in the domain that owns the operation. If none
  does, use a named workflow module that calls owning feature services. Keep
  it separate from entrypoint assembly and do not create a catch-all layer.
- Packages own reusable integrations. App platform modules adapt those
  integrations to requests and runtime bindings; do not implement them twice.
  For example, `packages/auth` owns verification and session operations;
  `platform/auth.ts` owns request identity and auth HTTP handlers.
- Features may import platform adapters; adapters must not import feature
  implementations. Keep domain-specific storage, AI, and job logic in its
  owning feature. Entry points register handlers and bind resources only.
- Keep code local until another domain needs it. Do not add root-level
  `helpers/`, `utils/`, `common/`, or root `services/` catch-all folders.
  Reuse an existing owning package before adding a shared package.
- Define services with Effect's context APIs and provide implementations with
  Layers. Bind Cloudflare resources at the Worker boundary.
- Put shared RPC contracts in `packages/rpc`. Contracts must not import server
  handlers, secret configuration, or Cloudflare resource instances.
- Configure project-specific import restrictions and package overrides in
  the Vite+ `lint` block. Reject browser imports of server or database runtime
  modules, Drizzle runtime imports outside `packages/db`, platform adapter
  imports of features, and cross-feature imports of RPC, HTTP, or job handlers.
  Cover package subpaths, aliases, and relative imports. Keep Worker assembly
  imports allowed only in server-only entrypoints. Shared lint rules come
  from `@yopem/oxlint-config`.
- Keep D1 data-access imports in the database package. Keep Drizzle Kit and
  Studio in local tooling, not Worker or browser bundles.
- Verify import restrictions when adding or changing boundaries. Check both
  allowed and rejected imports through the configured linter. If a boundary
  cannot be enforced by existing tooling, report that gap; do not claim it
  is enforced.
- Do not create barrel files that only re-export modules. Import concrete
  modules through package subpaths.
- An `index.ts` is allowed when it contains real assembly or initialization
  logic, such as handler composition, service Layers, or environment parsing.

## Effect application patterns

- Keep Effect success, error, and dependency types precise. Let inference work
  unless a public contract needs annotations. Use `Effect.gen` or normal Effect
  composition.
- Model expected failures with Schema-backed tagged errors. Do not replace
  typed failures with defects, empty results, or unchecked exceptions.
- Wrap external Promise APIs at service boundaries with `Effect.tryPromise`.
  Map errors to domain errors and pass cancellation signals when supported.
- Keep Promise execution at HTTP, RPC-client, queue, scheduled, and script
  boundaries. Do not call `Effect.runPromise` inside domain services.
- Use Effect Scope and Layers for resource lifetime. Release resources when
  their owning execution ends; do not keep request resources in global state.
- Use Effect Schedule for bounded retries and backoff. Retry only failures that
  can succeed later. Make retried writes and jobs idempotent.
- Use Effect concurrency controls for parallel work. Set limits that respect
  Workers, D1, and upstream service limits.
- Use Effect Stream for streamed application data. Check Worker transport and
  execution limits before exposing long-lived streams.
- Use Effect's logging and tracing APIs with Workers Logs and Traces. Redact
  credentials, tokens, and private user data.
- Use Effect data, date, duration, and schema APIs when they meet the need.
  Keep native Web APIs where they are required by Cloudflare or the framework.
- Do not add duplicate validation, retry, dependency-injection, logging, or
  asynchronous utility libraries when Effect provides the required behavior.
- Effect fibers, caches, and queues are execution-local tools. They do not
  replace durable Cloudflare Queues, Workflows, storage, or coordinated state.

## Effect RPC and HTTP

- Define RPC requests with `Rpc` and compose domain contracts with `RpcGroup`.
- Use Effect Schema for payloads, success values, and expected errors.
- Implement contracts with `RpcServer` and call them through `RpcClient`.
  Use APIs and imports from the pinned Effect release.
- Mount the HTTP RPC transport under `/rpc` in the single Worker entrypoint.
  RPC names identify operations; do not create a separate REST route per RPC.
- Use the same serialization layer and compatible protocol versions on both
  client and server. Do not hand-write RPC envelopes or duplicate route types.
- Apply authentication and domain authorization through RPC middleware and
  Effect services. Check permissions for each operation on the server.
- Handle health checks and other non-RPC endpoints with Effect HTTP APIs or
  native Web handlers at the application boundary. Add `/auth/*` only when the
  project's authentication flow needs it.
- Adapt Effect HTTP handling to Web `Request` and `Response` for Workers. Do not
  start a Node.js listener or import a Node.js HTTP server adapter.
- Route `/rpc` and `/auth/*` before frontend SSR or SPA fallback. Keep failures
  and unknown API requests from returning frontend HTML.
- Use same-origin requests and cookies. Do not add cross-origin API hosting or
  CORS rules unless an explicit external client requires them.
- Effect RPC is not an OpenAPI REST contract. Add an Effect HTTP API contract
  and REST documentation only when an external REST/OpenAPI requirement exists.

Use the ownership table and growth rules above for file placement.

- Keep server-only errors in the owning feature. Put errors exposed by RPC
  in its browser-safe contract module instead.
- The Worker entrypoint dispatches queue and scheduled events to domain jobs.
  Backend `index.ts` assembles handlers and Layers; it does not start a listener.
- Keep seed and maintenance entrypoints in `scripts/`. Call owning services
  instead of copying business logic or SQL.

## Environment and validation

- Read application configuration and bindings only through `packages/env`.
- Read server values from the Worker's `env` bindings. Use an Effect
  ConfigProvider for scalar configuration and Effect Schema for boundary data.
- Supply D1, R2, KV, and other resource bindings as typed Effect services. Do
  not parse resource objects as strings or resolve them through `process.env`.
- Validate required configuration before its first use. Do not skip validation
  in CI; provide valid test configuration for checks that execute the app.
- Do not read `.env` directly from application code. Local Node.js scripts may
  use a separate validated config provider through the same environment package.
- Do not use `import.meta.env` as the server's environment source. Expose only
  approved public build values to client bundles.
- Keep secrets server-only. Use Alchemy's secret handling and Cloudflare secret
  bindings. Never expose credentials in client exports, logs, errors, or state
  files committed to git.
- Keep local environment and secret files untracked. Do not embed secret values
  in `alchemy.run.ts`.
- Bind test resources and config through the same typed services as production.
- Use one local application origin and the project's configured port. Do not
  create a second API listener.
- Use the selected Alchemy local mode and Cloudflare runtime integration for D1,
  R2, KV, and queues. Do not run PostgreSQL or Redis containers.
- If sessions use cookies, preserve the project's cookie names and expiry
  contract. Set `httpOnly` and secure production settings.
- Prefer host-only cookies and `sameSite: lax` for same-origin sessions. Use
  `sameSite: none` only when the issuer/client contract requires cross-site
  cookies, with `secure` enabled. Protect state-changing requests from CSRF.
- When using OAuth/OIDC, verify state, PKCE where required, callback targets,
  issuer, token signatures, audience, expiry, and identity schemas. Effect
  validation does not replace authentication checks.

## OpenAuth authentication

- Use `createClient` from `@openauthjs/openauth/client`. Set the issuer to
  `https://auth.yopem.com` through `packages/env`. Get the application's client
  ID, callback URL, and subject contract from its configuration; do not invent
  these values or change the external issuer without approval.
- Keep the client and authentication services in `packages/auth`. Import only
  client and subject APIs; do not add OpenAuth issuer, provider, or login UI code
  to the application. The existing issuer stays outside Alchemy's app deployment.
- Define subjects with Effect Schema through the pinned release's Standard
  Schema adapter and OpenAuth's `createSubjects`. Match subject names and fields
  issued by the existing server. Do not add Valibot or Zod for this integration.
- Start authorization, handle callbacks, exchange codes, refresh tokens, and
  log out through same-origin `/auth/*` handlers in the application Worker.
  Browser redirects may visit the external issuer; API calls remain same-origin.
- Use the authorization code flow with PKCE. Bind state and the verifier to the
  initiating browser session, expire them, and consume them once. Validate state
  before code exchange. Use the same approved callback URL for authorization
  and exchange; accept only safe application-local return paths.
- Wrap OpenAuth Promise APIs in Effect services. Handle both rejected Promises
  and returned `err` results as typed failures. Verify access tokens with
  `client.verify` and the subject schemas before RPC authorization; decoding a
  token is not verification. Keep domain permissions separate from identity.
- Keep tokens in server-managed sessions or secure, HTTP-only app cookies, not
  browser storage. Persist refreshed access and refresh tokens when OpenAuth
  returns them. Clear app sessions on logout or invalid refresh credentials.
  Do not assume that clearing a cookie revokes the issuer's tokens or session.
- Keep app cookies host-only. Do not share cookies across `.yopem.com` or depend
  on issuer cookies as application sessions. Preserve the cookie and CSRF rules
  above. Never log tokens, authorization codes, or PKCE verifiers.

## TanStack and application patterns

- **TanStack Query:** call the typed Effect RPC client from `packages/rpc` inside
  query and mutation hooks. Execute client Effects at this boundary and pass
  cancellation signals where supported. Do not use raw `fetch` in components.
- Never spread TanStack Query query or mutation result objects. This includes
  `...query`, `{ ...query }`, `...mutation`, and `{ ...mutation }`. Read or return
  only the required properties explicitly. This rule does not apply to query
  or mutation option objects.
- **TanStack React Form:** use `useForm` with Effect Schema through its Standard
  Schema adapter. Validate required fields on blur and submit, not on change or
  mount, so untouched fields show no error. Repeat validation on the server.
- **TanStack Table, when needed:** use `@tanstack/react-table` for tables that
  need sorting, filtering, selection, or pagination. Use existing UI components
  for rendering. Do not install it for a plain static table.
- **TanStack Virtual, when needed:** use `@tanstack/react-virtual` for large
  lists or tables when rendering all rows causes measured performance
  problems. Keep keyboard navigation and accessibility intact.
- **Server-only web logic:** use `createServerFn` where needed by TanStack Start.
  Keep it server-only and use existing Effect services instead of copying logic.
- **AI, when needed:** keep Effect AI provider setup and execution server-side.
  Validate structured output and tool inputs with Effect Schema.
- Use `lucide-react` icons only, with the `Icon` suffix in import names.

## Yopem UI and StyleX

- Read https://ui.yopem.com/docs/installation and each component's documentation
  before setup or use. Use the Node.js-compatible `@yopem-ui/cli` to initialize
  the target workspace and add components. Do not copy Bun commands from older
  documentation.
- Components are copied source, not a runtime component package dependency.
  Import the installed local modules. Keep `ui.json` as the CLI's file record.
- Use Yopem UI components before adding custom controls or Base UI primitives.
  Keep semantic elements, accessibility, event handlers, and refs intact.
- Use `stylex.create` and semantic tokens. Pass styles through `xstyle` on
  Yopem UI components and `stylex.props(...)` on native or framework elements.
  Use component props such as `variant` and `size` before local overrides.
- Change shared tokens for application-wide styles. Preserve readable contrast
  and focus, hover, and disabled states. Do not add Tailwind.
- A fixed theme needs no provider. Add Yopem UI's theme runtime only for theme
  switching. In SSR, place its script before hydration and use matching defaults
  for the script and provider. Pass the CSP nonce when required.
- Keep the CLI's StyleX build integration, aliases, root styles, and lint rules.
  Merge tool settings into Vite+ rather than keeping generated standalone lint
  files. Preserve CLI behavior and existing project settings during this merge.
- Register `@yopem-ui/oxlint-plugin` in Vite+ with the recommended rules and
  `no-raw-stylex-colors`. Keep the documented overrides for copied primitives
  and document shells. Match component source paths to the repository layout.
- Run a production build after UI setup or token changes. Check StyleX CSS
  extraction and SSR behavior.

## Cloudflare data and job rules

- D1 uses SQLite semantics, not PostgreSQL semantics. Use Drizzle ORM's D1
  adapter for every runtime database operation, including queries, inserts,
  updates, deletes, batches, seeds, and maintenance scripts. Wrap asynchronous
  execution in Effect services with typed errors. Do not bypass Drizzle with
  direct D1 queries or add an Effect SQL client as a second data-access path.
- Use Drizzle query builders and parameterized `sql` expressions when a query
  needs custom SQL. Never concatenate untrusted values into SQL. Validate
  inputs and returned data with Effect Schema, including custom SQL results.
- Check the pinned Drizzle D1 adapter's capabilities. Do not assume it supports
  interactive SQL transactions or streaming queries. Use Drizzle's D1 batch
  API for supported atomic writes; do not emulate transactions with separate
  requests.
- Use Drizzle table definitions as the database structure source of truth.
  Generate versioned SQL migrations with Drizzle Kit. Review generated SQL and
  keep its migration metadata with the SQL files. Use custom Drizzle migrations
  when schema changes or data backfills need SQL that cannot be generated.
  Effect Schema validates application data; it does not define SQL migrations.
- Apply those migration files through the pinned Alchemy D1 integration's
  supported migration path as an explicit release step. Do not add a second
  migration history or use schema push against shared or production databases.
  Validate seed and backfill data with Effect Schema before database writes.
- Configure Drizzle Kit and Drizzle Studio in `packages/db/drizzle.config.ts`.
  Use Studio for database inspection. Default to local or isolated development
  databases. Confirm the target before connecting to a remote database or
  changing data. Studio edits bypass application validation; do not use them
  instead of validated application operations or reviewed migrations.
  Keep Studio credentials in untracked, server-only local configuration and
  never expose Studio publicly.
- Use Durable Objects when operations need coordinated state. Do not use KV for
  permissions, locks, counters, or state that requires immediate consistency.
- HTTP caches are not durable storage. Separate public and private responses;
  never cache private responses under shared public keys.
- Access R2 through Worker bindings. Check upload size, media type, magic bytes,
  ownership, and download authorization. Keep bucket credentials out of clients.
- Queue delivery can repeat. Make consumers idempotent.
  Acknowledge messages only after successful work and configure bounded retries
  and a dead-letter queue when needed.
- Cron handlers enqueue bounded work instead of processing all records in one
  execution. Use `ctx.waitUntil` only for permitted short background work.
- Use Cloudflare Workflows for durable waits and resumable multi-step work.
  Do not rely on a detached fiber or timer after a Worker invocation ends.

## Code conventions not covered by shared config

- React components and hooks use named `export function` declarations. Do not
  use default exports for React code.
- Prefer function declarations for named functions. Let shared lint rules govern
  anonymous callbacks.
- Prefer inferred return types unless a public contract needs an explicit type.
- Use static imports. Do not use `await import()`.
- Omit file extensions where the bundler supports this. Use valid Node.js ESM
  imports for scripts that run without a bundler.
- Add comments only for behavior that clear names and structure cannot explain,
  or for a required lint safety justification.
- Keep components and functions focused and easy to understand.
- Fix check failures at their source. Do not suppress rules, weaken types, or
  remove assertions to hide failures.

## Vite+ tooling and shared configuration

- Use `defineConfig` from `vite-plus` in `vite.config.ts`. This file owns all
  lint and format configuration: Oxlint settings in `lint`, Oxfmt settings in
  `fmt`. Put test settings in `test`, cached tasks in `run`, and staged-file
  checks in `staged`.
- Use the root config for shared monorepo defaults. Keep workspace configs only
  for required framework, runtime, build, or test settings.
- Compose `@yopem/oxlint-config` with its React, TanStack Start, and Effect
  presets in the root Vite+ `lint` block. Apply frontend presets to frontend
  files and the Effect preset where Effect is used. Preserve plugin registrations
  and set the shared base's type-aware options at the root; `extends` alone does
  not apply these options.
- Treat shared lint config as the source of truth for rules it covers. Do not
  repeat those rules in this file or copy their definitions into local config.
  Add only project-specific policies and required integrations.
- Set `react-policy/no-restricted-hooks` to error with `restrictUseEffect: true`
  to prohibit `useEffect`, `useCallback`, and `useMemo`. The shared React preset
  warns on memoization hooks and does not restrict `useEffect` by default.
- Keep shared React Doctor rules. Enable React Compiler diagnostics through a
  compatible Oxlint integration when the shared presets do not supply them.
  React Doctor rules alone do not provide these compiler checks.
- Put formatting choices in `fmt`: no semicolons, double quotes, 80-column
  lines, trailing commas, and the project's import order. Do not restate
  formatter-enforced rules as agent instructions.
- Extend `@yopem/typescript-config/base` or `@yopem/typescript-config/react` in
  `tsconfig.json`. Keep required project overrides; do not copy shared compiler
  settings or weaken them to clear diagnostics.
- Vite+ owns Oxlint and Oxfmt execution. Keep `@yopem/oxlint-config` and
  `@yopem-ui/oxlint-plugin` compatible with the Oxlint version bundled by the
  selected Vite+ release. Verify peer dependencies before setup or upgrades.
- Use Vite+ checks and its Vitest-based test runner. Import test APIs from
  `vite-plus/test` and the documented browser-test subpaths. Keep E2E coverage;
  an existing dedicated E2E runner can run as a Vite+ task.
- Use Vite+ tasks for workspace ordering and caching instead of Turborepo.
  Verify dependency ordering and file and environment tracking. Set `cache: false`
  for deployment, remote migrations, seeds, and other external mutations; tasks
  in `run.tasks` are cached by default.
- Use Vite+ hooks and staged checks instead of Husky and lint-staged. Preserve
  existing user hooks during setup. CI runs full checks; staged checks do not
  replace them.
- Do not create or maintain `oxlint.config.*`, `oxfmt.config.*`, `.oxlintrc.*`,
  or `.oxfmtrc.*`. Merge CLI-generated lint and format settings into
  `vite.config.ts`; verify them before removing generated standalone configs.
- Do not maintain standalone Vitest configuration, `turbo.json`, or separate
  staged-check configuration alongside Vite+. Keep a dedicated E2E runner's
  config only when that runner needs it. Move and verify required settings
  before removing old files.
- `package.json` owns package scripts. `pnpm-workspace.yaml` defines workspace
  packages; `pnpm-lock.yaml` is the dependency lockfile. Do not create lockfiles
  for other package managers. Use `pnpm exec` for installed CLIs and `pnpm dlx`
  for one-time package execution.
  Read existing scripts and Vite+ tasks before running commands. Do not assume
  project-specific script names. Use `vp run` for configured scripts and tasks;
  built-in commands do not run same-named scripts. Do not define the same task
  name in both `package.json` and `run.tasks`.
- Vite+ builds and runs tasks. Alchemy owns Cloudflare resource management as
  described in the deployment rules below.
- Do not maintain Bun configuration, Bun lockfiles, Docker deployment files,
  or hand-written Wrangler configuration alongside this stack.
- Confirm the target environment before migrations, seeds, or deployment. Do
  not run destructive resource commands or production seeds without approval.

## Infrastructure and single-Worker deployment

- Use Alchemy (`https://alchemy.run`) as the infrastructure source of truth.
  Keep the root TypeScript infrastructure program in `alchemy.run.ts` and wire
  package scripts to the entrypoint supported by the pinned Alchemy release.
- Declare exactly one application Worker per environment. Source packages do
  not become separate deployments. Do not create separate frontend and backend
  Workers, Pages projects, containers, or an internal API service binding.
- Use one custom TanStack Start Worker entrypoint in `apps/web` to compose
  Effect RPC, frontend SSR, required auth routes, and other HTTP handlers.
- Attach frontend static assets to that same Worker. Route API and auth requests
  to Worker code before asset or SPA fallback can handle them.
- Add `scheduled` and `queue` handlers to the same entrypoint when needed.
  Export Durable Object and Workflow classes from that deployment when used.
- Use the Alchemy TanStack Start integration only if the pinned version supports
  this custom entrypoint and handlers. Otherwise, declare one Alchemy Worker
  with the combined build output and assets. Never solve this by adding a second
  Worker.
- Declare D1 databases, R2 buckets, KV namespaces, Queues, required Durable Object
  and Workflow bindings, AI bindings, routes, and Cron Triggers through Alchemy.
  Add only resources required by the current task.
- Keep runtime bindings, compatibility settings, asset routing, and public
  configuration in Alchemy. Generated Worker configuration is build output,
  not a second hand-maintained source of truth.
- D1, R2, KV, Queues, and other managed resources remain separate Cloudflare
  resources. One Worker means one deployed application script, not one resource.
- Keep stage resources and Alchemy state separate. Do not share production
  databases, buckets, or queues with local development and preview stages.
- Protect durable resources from accidental deletion or replacement. Review
  resource changes before deployment; use the pinned Alchemy release's supported
  protection and state controls. Never run a destroy command without approval.
- Run D1 migrations as an explicit release step. Verify migration results before
  deploying code that needs them. Worker rollback does not roll back data.
- CI runs Vite+ checks, the combined build, and Alchemy deployment. Keep Cloudflare
  credentials and any sensitive Alchemy state out of git and build artifacts.
- Do not deploy with Wrangler or dashboard edits as a parallel configuration
  path. A tool may generate or consume runtime config internally under Alchemy.

## Testing rules

- Prefer E2E tests that exercise real user workflows in the Cloudflare runtime.
- Define expected behavior and tests before changing non-trivial behavior.
- Test observable behavior and public contracts, not documentation wording.
  Do not assert full sentences, descriptions, warnings, or lists of prose fragments.
  Wording changes must not require test changes unless wording is the requested contract.
- Assert exact text only for stable identifiers, commands, URLs, required legal text,
  or accessible names used to operate the interface.
  For documentation, check response status, content type, valid links, and usable examples.
- Use public inventories to check published resources. Check structured fields,
  dependencies, and consumer imports instead of full generated-file equality.
- Do not test implementation source with string searches when rendered output or
  user interaction can verify the same contract. Test copy controls through clipboard output.
  Keep security and accessibility checks.
- Cover the changed behavior, including authorization, Effect RPC success and
  errors, D1 persistence, and authorized R2 access when those features exist.
- Verify the single deployment serves frontend HTML, assets, `/rpc`, and any
  required auth handlers on one origin. API requests must not receive frontend
  fallback HTML.
- Test bindings and schema validation with repeatable fixtures. Keep local test
  resources separate from production resources.
- When authentication changes, test OpenAuth login, callback state and PKCE,
  invalid tokens, refresh persistence, logout, and denied RPC operations. Do not
  change the live issuer or use production accounts for automated tests.
- Test queue retries and duplicate delivery when job behavior changes.
- Run relevant tests after each behavior change through Vite+ or its tasks.
  Run format, lint, typecheck, and build checks before finishing implementation.
- Save and inspect an E2E report, trace, or equivalent artifact. State setup and
  inputs so the same test can run again.
- If isolated Effect tests are required, define them before implementation and
  use the Effect test integration compatible with the selected runner.
- Documentation-only changes do not need source tests, but must be checked for
  stale tool, runtime, infrastructure, and architecture references.

## Generated, runtime, and protected files

- Do not manually edit generated route trees, framework caches, Worker config,
  binding types, or Alchemy-generated output.
- `routeTree.gen.ts`, `.tanstack/`, build output, and local runtime state are
  generated and ignored.
- Keep Cloudflare bindings and server services out of browser bundles. Keep
  Node.js-only tooling out of deployed Worker code.
- Do not commit secrets, local environment files, sensitive infrastructure state,
  build output, dependency caches, or temporary files.

## Git and completion

- Keep one commit per feature, fix, or context switch.
- Check `git status` before and after work.
- Do not include unrelated files in a commit.
- Before completion, check that each new file belongs to its owning domain
  or shared module. Check that cross-feature dependencies remain acyclic,
  business logic is not copied across entrypoints, and direct database calls
  meet the simple-operation rule in Architecture boundaries.
- Run the relevant checks and inspect their results. Report unresolved
  boundary violations and tooling gaps; do not treat written rules as proof
  that the code follows them.
- Final response must state changed files, checks run, and any skipped check.
