import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { UI_LOCALES } from "../../src/i18n";
import { ROOT, noSymlink } from "./paths";
import { collectMedia, loadCatalog } from "./catalog";
export function walk(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`出力にsymlink: ${file}`);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
export function checkPrivacy(
  output = path.join(ROOT, "dist/public"),
  sentinels: string[] = [],
) {
  noSymlink(ROOT, path.join(ROOT, "dist/public"));
  if (!fs.existsSync(path.join(output, "build-info.json")))
    throw new Error("公開ビルドがありません");
  const info = JSON.parse(
    fs.readFileSync(path.join(output, "build-info.json"), "utf8"),
  );
  if (info.mode !== "public") throw new Error("公開成果物のモードが不正です");
  const items = loadCatalog("public");
  const media = collectMedia(items, ROOT);
  const allowed = new Set([
    "index.html",
    "practical/index.html",
    "grammar/index.html",
    "library/index.html",
    "build-info.json",
    ...UI_LOCALES.flatMap((locale) => [
      `${locale}/index.html`,
      `${locale}/practical/index.html`,
      `${locale}/grammar/index.html`,
      `${locale}/library/index.html`,
      `${locale}/library/plans/index.html`,
      `${locale}/guide/index.html`,
      ...items.map((w) => `${locale}/read/${w.slug}/index.html`),
    ]),
    ...items.map((w) => `read/${w.slug}/index.html`),
    ...media.map((m) => m.relative),
  ]);
  for (const file of walk(output)) {
    const relative = path.relative(output, file).split(path.sep).join("/");
    if (
      !allowed.has(relative) &&
      !/^_astro\/[a-zA-Z0-9_.-]+\.(css|js)$/.test(relative)
    )
      throw new Error(`許可されていない公開ファイル: ${relative}`);
    const bytes = fs.readFileSync(file);
    for (const marker of [
      ...sentinels,
      "/media/private/",
      "PRISM_PRIVATE_ROOT",
      ".env.local",
      "/Users/",
      "file://",
    ]) {
      if (relative.includes(marker) || bytes.includes(Buffer.from(marker)))
        throw new Error(`公開成果物に禁止文字列: ${relative}`);
    }
  }
  const workflow = fs.readFileSync(
    path.join(ROOT, ".github/workflows/pages.yml"),
    "utf8",
  );
  if (
    !workflow.includes("path: dist/public") ||
    /build:local|dist\/local|init:local|PRISM_PRIVATE_ROOT|cp\s|rsync/.test(
      workflow,
    )
  )
    throw new Error("Pages workflow が公開専用ではありません");
  const tracked = spawnSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (tracked.status === 0) {
    for (const name of tracked.stdout.split("\0").filter(Boolean)) {
      if (
        /^(?:\.env(?!\.example$)|dist\/|\.generated\/|\.cache\/|\.astro\/|\.venv[^/]*\/|node_modules\/|_misc\/|voices\/|d1ssk.github.io(?:\/|$))/.test(
          name,
        ) ||
        /(?:^|\/)private\//.test(name) ||
        /\.(wav|safetensors|pt|pth)$/.test(name)
      )
        throw new Error(`Git管理対象に禁止ファイル: ${name}`);
    }
  }
  console.log(
    `Privacy OK: ${items.length} public contents, ${media.length} allowlisted audio files${tracked.status !== 0 ? " (Git未初期化: tracked files検査は対象なし)" : ""}`,
  );
}
if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  checkPrivacy();
