import { defineConfig } from "astro/config";
import { prepare } from "./scripts/build/catalog.ts";
import { resolveBase } from "./scripts/build/paths.ts";
const mode = process.env.PRISM_MODE ?? "public";
if (!["public", "local"].includes(mode)) throw new Error("Invalid PRISM_MODE");
if (mode === "local" && process.env.PRISM_LOCAL_EXPLICIT !== "1")
  throw new Error("Use npm run dev:local or build:local");
const { staging } = prepare(mode);
const port = Number(
  process.env.PRISM_PORT || (mode === "public" ? 4341 : 4342),
);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PRISM_PORT must be an integer from 1024 to 65535");
export default defineConfig({
  output: "static",
  site: process.env.PRISM_SITE || "https://d1ssk.github.io",
  base: resolveBase(),
  trailingSlash: "always",
  publicDir: `${staging}/assets`,
  outDir: `./dist/${mode}`,
  cacheDir: `./node_modules/.astro-${mode}`,
  server: { host: "127.0.0.1", port },
  vite: {
    envDir: false,
    build: { sourcemap: false },
    server: {
      strictPort: true,
      fs: {
        strict: true,
        deny: [
          "**/.env*",
          "**/.git/**",
          "**/_misc/**",
          "**/d1ssk.github.io/**",
          "**/dist/**",
          "**/.generated/local/**",
        ],
      },
    },
  },
});
