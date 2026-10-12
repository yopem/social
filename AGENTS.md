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
- **Application foundation:** Effect from https://effect.website. Use Effect
  for domain logic, typed errors, services, dependency injection, concurrency,
  retries, timeouts, resource management, logging, and tracing.
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
- **Database:** Cloudflare D1 (SQLite) through Drizzle ORM's D1 driver.
  Define tables with Drizzle. Use Drizzle Kit for migrations and Drizzle Studio
  for local database inspection. Keep Effect Schema for domain input, stored
  row, and output validation.
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
documentation for the pinned versions before selecting APIs. Do not mix Effect
major versions or package imports from different releases. Use an Effect Schema
integration that supports the pinned Effect release. Do not upgrade Effect to
another major version only to add Drizzle. Use the Node.js platform adapter only
in local scripts; keep it out of Worker and browser bundles.

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
│   │       │   └── <domain>/      one folder per application domain
│   │       │       ├── components/ feature UI and forms
│   │       │       ├── hooks/     feature behavior and form hooks
│   │       │       ├── queries.ts RPC-backed query and mutation options
│   │       │       └── schema.ts  feature-only Effect schemas when needed
│   │       ├── components/       shared application components
│   │       ├── lib/              query client and browser RPC setup
│   │       └── styles/           application styles and root CSS
│   └── server/                    source-only backend; no deployment
│       ├── package.json           server dependencies and source exports
│       ├── tsconfig.json          shared base preset and runtime types
│       └── src/
│           ├── index.ts           handler and service Layer assembly
│           ├── middleware/        auth, permissions, and request controls
│           ├── rpc/               domain RPC handler implementations
│           ├── services/          reusable Effect domain services
│           ├── handlers/          non-RPC HTTP and optional auth handlers
│           ├── lib/               errors, context, crypto, and helpers
│           ├── storage/           optional R2 and media services
│           ├── jobs/              optional queue and scheduled handlers
│           ├── ai/                optional Effect AI providers and tools
│           └── scripts/           optional local maintenance scripts
├── packages/
│   ├── db/
│   │   ├── package.json           database dependencies and source exports
│   │   ├── tsconfig.json          shared base preset
│   │   └── src/
│   │       ├── schema/            Drizzle tables and Effect row schemas
│   │       ├── services/          Drizzle queries and Effect Layers
│   │       └── migrations/        Drizzle Kit SQL and migration metadata
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

Web code uses feature-first organization:

- Domain code belongs in `src/features/<domain>/`.
- Shared application code belongs in `src/components/`.
- Keep feature components, hooks, and queries together. Shared domain schemas
  belong with their owning package; do not copy RPC schemas into features.
- Configure the framework and Alchemy to use the custom Worker entrypoint.
  Preserve existing entrypoint names when they differ from `worker.ts`.
- Keep CLI-generated UI paths consistent with `ui.json` and the build aliases.
  Initialize the workspace that owns the components; do not duplicate them.
- Workspace Vite configs do not own separate lint or format policies. Keep
  those settings in the root `vite.config.ts`.
- `apps/server` is a source package. It has no separate deployed server,
  Worker, public port, or service binding to the frontend.

## Architecture boundaries

Use this request flow. Shared contracts never import server handlers:

```text
apps/web → packages/rpc contracts/client → apps/server handlers
                                         → packages/db services → D1
```

- Browser code calls the typed Effect RPC client. Browser code never imports
  SQL clients, D1 bindings, database services, or server implementation modules.
- The web Worker's server-only entrypoint imports the backend handlers to build
  one application. Keep this import out of client bundles.
- All database access lives in `packages/db/src/services/`.
- Keep Drizzle tables and Effect row schemas in `packages/db/src/schema/`,
  data access in `src/services/`, and Drizzle Kit migration output in
  `src/migrations/`. Keep the Drizzle Kit config in `packages/db`.
- Use Drizzle ORM for database queries. Wrap its Promise APIs with
  `Effect.tryPromise` in data-access services. Map failures to typed errors.
- Define domain schemas with Effect Schema and infer domain types from them.
  Derive stored-row schemas from Drizzle tables where the compatible Effect
  integration supports them. Validate D1 results at the data-access boundary.
  Do not add `drizzle-zod`, Zod, or another runtime schema library.
- Keep Drizzle imports, database clients, and SQL inside `packages/db`.
  Browser code and RPC contracts must not import Drizzle table definitions.
- Generate schema migrations with Drizzle Kit. Preserve applied migration
  history. Use reviewed custom SQL migrations for triggers or operations that
  Drizzle cannot describe. Do not apply remote migrations without approval.
- Keep Drizzle Studio local by default. Use a confirmed local D1 SQLite file or
  an isolated development database. Do not open production data in Studio
  without explicit approval. Keep Studio credentials and local paths out of git.
- Reuse the project's ID helper when present. Otherwise, use a platform API
  that meets the required ID format; do not add a helper package in advance.
- Keep handlers thin: authentication, validation, authorization, and service
  calls only. Keep reusable domain logic in Effect services.
- Define services with Effect's context APIs and provide implementations with
  Layers. Bind Cloudflare resources at the Worker boundary.
- Put shared RPC contracts in `packages/rpc`. Contracts must not import server
  handlers, secret configuration, or Cloudflare resource instances.
- Store project-specific import restrictions and package overrides in the
  Vite+ `lint` block. Limit Drizzle and D1 data-access imports to the database
  module. Shared lint rules come from `@yopem/oxlint-config`.
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

For a backend organized under `apps/server/src`, use:

- `index.ts` for backend handler and Layer assembly, not a listener.
- `middleware/` for RPC auth, authorization, and request controls.
- `lib/` for shared server errors, context, crypto, and helpers.
- `rpc/` for domain RPC handler implementations.
- `services/` for reusable Effect domain services; use `packages/db` for SQL.
- `handlers/` for OAuth callbacks and other non-RPC HTTP handlers.
- `storage/` for R2 services, image operations, and magic-byte checks.
- `jobs/` for queue consumers and scheduled work when needed.
- `ai/` for Effect AI services, tools, and model calls when needed.
- `scripts/` for seed and maintenance scripts outside runtime code.

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

- D1 uses SQLite semantics, not PostgreSQL semantics. Use Drizzle's
  parameterized queries and versioned Drizzle Kit migrations. Keep migrations
  separate from request handling.
- Check Drizzle's D1 driver capabilities for the pinned release. Do not assume
  it supports interactive SQL transactions or streaming queries. Use its D1
  batch support for atomic writes. Use parameterized Drizzle SQL only when a
  query needs SQLite features that its query builder cannot express.
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
- Final response must state changed files, checks run, and any skipped check.
