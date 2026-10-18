import babel from "@rolldown/plugin-babel"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import alchemy from "alchemy/cloudflare/tanstack-start"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite-plus"

const source = fileURLToPath(new URL("./src", import.meta.url))

const uiSource = fileURLToPath(
  new URL("../../packages/ui/src/", import.meta.url),
)

const require = createRequire(import.meta.url)

export default defineConfig(({ command, mode }) => {
  const stylexPlugins = [
    [
      "@stylexjs/babel-plugin",
      {
        aliases: { "@/*": [source + "/*"], "ui/*": [uiSource + "/*"] },
        dev: mode !== "production",
        runtimeInjection: false,
        treeshakeCompensation: true,
        unstable_moduleResolution: { type: "commonJS" },
      },
    ],
  ]

  const postcss = require("@stylexjs/postcss-plugin")({
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    include: ["src/**/*.{js,jsx,ts,tsx}", uiSource + "/**/*.{js,jsx,ts,tsx}"],
    babelConfig: {
      babelrc: false,
      parserOpts: { plugins: ["typescript", "jsx"] },
      plugins: stylexPlugins,
    },
    useCSSLayers: true,
  })

  return {
    plugins: [
      babel({ plugins: stylexPlugins }),
      alchemy({
        config:
          command === "build"
            ? {
                main: fileURLToPath(
                  new URL("./src/worker.ts", import.meta.url),
                ),
              }
            : undefined,
      }),
      tanstackStart({ server: { entry: "./src/worker.ts" } }),
      react({ compiler: { reportDiagnostics: true } }),
    ],
    server: { port: 3200, strictPort: true },
    resolve: { alias: { "@": source } },
    css: { postcss: { plugins: [postcss] } },
  }
})
