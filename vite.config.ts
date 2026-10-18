import type { OxlintOverride } from "vite-plus/lint"

import { recommendedRules } from "@yopem-ui/oxlint-plugin"
import base from "@yopem/oxlint-config"
import effect from "@yopem/oxlint-config/effect"
import react from "@yopem/oxlint-config/react"
import start from "@yopem/oxlint-config/tanstack-start"
import { defineConfig } from "vite-plus"

const databaseImportRestriction = {
  group: [
    "@effect/sql",
    "@effect/sql/*",
    "@effect/sql-*",
    "@effect/sql-*/*",
    "drizzle-orm",
    "drizzle-orm/*",
    "drizzle-kit",
    "@handfish/drizzle-effect",
    "effect/sql",
    "effect/sql/*",
  ],
  message: "Keep database imports in packages/db.",
}

const serverDomains = [
  "accounts",
  "analytics",
  "channels",
  "feeds",
  "media",
  "posts",
  "publishing",
  "session",
  "workspaces",
]

const componentSources = ["ui/components/"]

const uiRules = Object.fromEntries(
  Object.entries({
    ...recommendedRules,
    "yopem-ui/prefer-layout-primitives": "error",
    "yopem-ui/no-raw-stylex-colors": "error",
    "yopem-ui/no-unused-stylex-styles": "error",
    "yopem-ui/static-stylex": "error",
  }).map(([name, level]) => [
    name,
    name === "yopem-ui/no-restyle" ||
    name === "yopem-ui/enforce-styling-methods"
      ? [level, { componentSources }]
      : level,
  ]),
)

export default defineConfig({
  lint: {
    ...base,
    options: { ...base.options, typeAware: true, typeCheck: true },
    settings: {
      "react-doctor": { capabilities: ["react-compiler"] },
    },
    rules: { ...base.rules, "yopem-ui/prefer-layout-primitives": "error" },
    plugins: [...(base.plugins ?? []), ...(react.plugins ?? [])],
    jsPlugins: [
      ...(base.jsPlugins ?? []),
      ...(react.jsPlugins ?? []),
      ...(effect.jsPlugins ?? []),
      {
        name: "yopem-ui",
        specifier: import.meta.resolve("@yopem-ui/oxlint-plugin"),
      },
    ],
    ignorePatterns: ["**/dist/**", "**/routeTree.gen.ts", "**/node_modules/**"],
    overrides: [
      {
        files: ["apps/web/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
        rules: {
          ...react.rules,
          ...start.rules,
          ...uiRules,
          "react-policy/no-restricted-hooks": [
            "error",
            { restrictUseEffect: true },
          ],
        },
      },
      {
        files: [
          "apps/**/*.{ts,tsx}",
          "packages/{rpc,db,auth,env}/**/*.{ts,tsx}",
          "tests/**/*.ts",
        ],
        rules: effect.rules,
      },
      {
        files: ["packages/ui/src/components/**/*.{tsx,jsx}"],
        rules: {
          "yopem-ui/no-restyle": "off",
          "yopem-ui/enforce-styling-methods": "off",
          "yopem-ui/static-stylex": "off",
          "yopem-ui/no-raw-stylex-colors": "off",
        },
      },
      {
        files: [
          "apps/**/*.{ts,tsx}",
          "packages/{auth,env,rpc,ui}/**/*.{ts,tsx}",
          "tests/**/*.ts",
          "alchemy.run.ts",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [databaseImportRestriction],
            },
          ],
        },
      },
      {
        files: ["apps/server/src/platform/**/*.ts"],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                databaseImportRestriction,
                {
                  group: ["server/features/**", "**/features/**"],
                  message: "Platform adapters must not import domain features.",
                },
              ],
            },
          ],
        },
      },
      ...serverDomains.map((domain): OxlintOverride => ({
        files: [`apps/server/src/features/${domain}/**/*.ts`],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                databaseImportRestriction,
                {
                  group: serverDomains
                    .filter((other) => other !== domain)
                    .flatMap((other) =>
                      ["rpc", "http", "jobs", "callback", "webhooks"].flatMap(
                        (handler) => [
                          `server/features/${other}/${handler}`,
                          `server/features/${other}/${handler}.*`,
                          `server/features/${other}/${handler}/**`,
                          `**/features/${other}/${handler}`,
                          `**/features/${other}/${handler}.*`,
                          `**/features/${other}/${handler}/**`,
                          `../${other}/${handler}`,
                          `../${other}/${handler}.*`,
                          `../${other}/${handler}/**`,
                        ],
                      ),
                    ),
                  message: "Call another domain's service, not its handlers.",
                },
              ],
            },
          ],
        },
      })),
      {
        files: [
          "apps/web/src/{components,features,lib,routes}/**/*.{ts,tsx}",
          "apps/web/src/router.tsx",
          "packages/rpc/src/**/*.ts",
        ],
        rules: {
          "no-restricted-imports": [
            "error",
            {
              patterns: [
                {
                  group: [
                    "@effect/sql",
                    "@effect/sql/*",
                    "@effect/sql-*",
                    "@effect/sql-*/*",
                    "drizzle-orm",
                    "drizzle-orm/*",
                    "drizzle-kit",
                    "@handfish/drizzle-effect",
                    "effect/sql",
                    "effect/sql/*",
                    "server",
                    "server/**",
                    "db",
                    "db/**",
                    "auth",
                    "auth/**",
                    "env/server",
                    "env/deployment",
                    "env/database",
                    "**/apps/server/**",
                    "**/packages/{db,auth}/**",
                    "**/packages/env/src/{server,deployment,database}",
                    "@server/**",
                    "@db/**",
                    "@auth/**",
                  ],
                  message:
                    "Keep backend services and resource bindings out of browser code.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
  fmt: {
    semi: false,
    singleQuote: false,
    printWidth: 80,
    trailingComma: "all",
    sortImports: {
      newlinesBetween: true,
      customGroups: [
        {
          groupName: "value-workspace",
          elementNamePattern: [
            "ui",
            "ui/**",
            "auth",
            "auth/**",
            "db",
            "db/**",
            "env",
            "env/**",
            "rpc",
            "rpc/**",
            "utils",
            "utils/**",
            "cache",
            "cache/**",
          ],
        },
        {
          groupName: "type-workspace",
          elementNamePattern: [
            "ui",
            "ui/**",
            "auth",
            "auth/**",
            "db",
            "db/**",
            "env",
            "env/**",
            "rpc",
            "rpc/**",
            "utils",
            "utils/**",
            "cache",
            "cache/**",
          ],
        },
      ],
      groups: [
        "type-import",
        ["value-builtin", "value-external"],
        "type-workspace",
        "value-workspace",
        "type-internal",
        "value-internal",
        ["type-parent", "type-sibling", "type-index"],
        ["value-parent", "value-sibling", "value-index"],
        "unknown",
      ],
    },
  },
  run: {
    tasks: {
      "workspace-types": {
        command: "pnpm exec tsc --noEmit && pnpm -r exec tsc --noEmit",
        cache: false,
      },
      "web-build": { command: "vp build", cwd: "apps/web" },
      "deploy-app": { command: "pnpm exec alchemy deploy", cache: false },
      "e2e-check": { command: "pnpm exec playwright test", cache: false },
      "database-generate": {
        command:
          "pnpm exec drizzle-kit generate --config packages/db/drizzle.config.ts",
        cache: false,
      },
      "database-studio": {
        command:
          "pnpm exec drizzle-kit studio --config packages/db/drizzle.config.ts --host 127.0.0.1 --port 4983",
        cache: false,
      },
    },
  },
  staged: { "*.{ts,tsx,js,json,yaml,css}": "vp check --fix" },
})
