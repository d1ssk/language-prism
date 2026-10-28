import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, noSymlink } from "./paths";
import { checkPrivacy } from "./privacy";
const [command, mode] = process.argv.slice(2);
if (
  !["dev", "build", "preview"].includes(command) ||
  !["public", "local"].includes(mode) ||
  process.argv.length !== 4
)
  throw new Error("Use the documented npm scripts (no host/output overrides).");
noSymlink(ROOT, path.join(ROOT, "dist", mode));
if (command === "preview") {
  const marker = path.join(ROOT, "dist", mode, "build-info.json");
  if (
    !fs.existsSync(marker) ||
    JSON.parse(fs.readFileSync(marker, "utf8")).mode !== mode
  )
    throw new Error(`先に npm run build:${mode} を実行してください`);
}
const astroBin = fs.realpathSync(path.join(ROOT, "node_modules/.bin/astro"));
// Astro 7 can auto-background in agent environments. Keep the documented Ctrl+C lifecycle.
const args =
  command === "build"
    ? [astroBin, command]
    : [astroBin, command, "--ignore-lock"];
const result = spawnSync(process.execPath, args, {
  cwd: ROOT,
  env: {
    ...process.env,
    PRISM_MODE: mode,
    PRISM_LOCAL_EXPLICIT: mode === "local" ? "1" : "0",
    ASTRO_TELEMETRY_DISABLED: "1",
  },
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
if (command === "build" && mode === "public") checkPrivacy();
