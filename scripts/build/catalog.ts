import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  contentSchema,
  type CatalogEntry,
  type Mode,
  type Scope,
} from "../../src/lib/schema";
import { ROOT, noSymlink, privateRoot } from "./paths";

export function readCollection(root: string, scope: Scope): CatalogEntry[] {
  if (!fs.existsSync(root)) return [];
  const result: CatalogEntry[] = [];
  noSymlink(root, root);
  for (const type of ["practical", "grammar", "library"]) {
    const directory = path.join(root, type);
    noSymlink(root, directory);
    if (!fs.existsSync(directory)) continue;
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const folder = path.join(directory, item.name);
      noSymlink(root, folder);
      if (!item.isDirectory()) continue;
      const file = path.join(folder, "content.json");
      noSymlink(root, file);
      if (!fs.existsSync(file))
        throw new Error(`content.json がありません: ${folder}`);
      const parsed = contentSchema.safeParse(
        JSON.parse(fs.readFileSync(file, "utf8")),
      );
      if (!parsed.success) throw new Error(`${file}\n${parsed.error.message}`);
      if (parsed.data.type !== type || parsed.data.id !== item.name)
        throw new Error(`格納先 type/id とデータが一致しません: ${file}`);
      result.push({ ...parsed.data, scope, availableAudio: {} });
    }
  }
  return result;
}
export function assertUnique(items: CatalogEntry[]) {
  for (const field of ["id", "slug"] as const) {
    const seen = new Set<string>();
    for (const work of items) {
      if (seen.has(work[field]))
        throw new Error(`${field} が重複しています: ${work[field]}`);
      seen.add(work[field]);
    }
  }
}
export function loadCatalog(
  mode: Mode,
  options: { root?: string; privateDirectory?: string } = {},
) {
  const root = options.root ?? ROOT;
  noSymlink(root, path.join(root, "content/public"));
  const publicItems = readCollection(
    path.join(root, "content/public"),
    "public",
  );
  // Deliberately do not evaluate any private path/settings on this branch.
  if (mode === "public") {
    assertUnique(publicItems);
    return publicItems.filter((item) => item.publicationStatus === "ready");
  }
  const privateDirectory = options.privateDirectory ?? privateRoot();
  if (!fs.existsSync(path.join(privateDirectory, "content")))
    throw new Error(
      "非公開データがありません。npm run init:local を実行してください",
    );
  noSymlink(privateDirectory, path.join(privateDirectory, "content"));
  const combined = [
    ...publicItems,
    ...readCollection(path.join(privateDirectory, "content"), "private"),
  ];
  assertUnique(combined);
  return combined;
}
export function collectMedia(
  items: CatalogEntry[],
  publicRoot: string,
  privateDirectory?: string,
) {
  const files: { source: string; relative: string }[] = [];
  for (const work of items) {
    const sourceRoot =
      work.scope === "public"
        ? path.join(publicRoot, "media/public")
        : path.join(privateDirectory!, "media");
    noSymlink(
      work.scope === "public" ? publicRoot : privateDirectory!,
      sourceRoot,
    );
    for (const unit of work.units)
      for (const [code, entry] of Object.entries(unit.languages)) {
        if (!entry.audio) continue;
        const source = path.join(sourceRoot, entry.audio.path);
        noSymlink(sourceRoot, source);
        if (!fs.existsSync(source)) continue;
        if (!fs.statSync(source).isFile() || fs.statSync(source).size === 0)
          throw new Error(`不正な音声: ${source}`);
        if (entry.audio.origin === "chatterbox") {
          const manifest = `${source}.json`;
          noSymlink(sourceRoot, manifest);
          if (!fs.existsSync(manifest))
            throw new Error(`TTS音声の生成記録がありません: ${manifest}`);
          const metadata = JSON.parse(fs.readFileSync(manifest, "utf8"));
          const input =
            entry.ttsText || (code !== "ja" ? entry.text : undefined);
          const audioHash = createHash("sha256")
            .update(fs.readFileSync(source))
            .digest("hex");
          if (
            !["mlx", "torch"].includes(metadata.backend) ||
            metadata.mock ||
            metadata.text !== input ||
            metadata.language !== code ||
            metadata.audio_sha256 !== audioHash
          )
            throw new Error(
              `TTS音声の生成記録が不正、古い、またはmockです: ${manifest}`,
            );
        }
        const relative = `media/${work.scope}/${entry.audio.path}`;
        work.availableAudio[`${unit.id}/${code}`] = relative;
        files.push({ source, relative });
      }
  }
  return files;
}
export function prepare(mode: Mode) {
  const staging = path.join(ROOT, ".generated", mode);
  const privateDirectory = mode === "local" ? privateRoot() : undefined;
  const items = loadCatalog(mode, { privateDirectory });
  const files = collectMedia(items, ROOT, privateDirectory);
  noSymlink(ROOT, staging);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, "assets"), { recursive: true });
  for (const file of files) {
    const target = path.join(staging, "assets", file.relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target);
  }
  fs.writeFileSync(path.join(staging, "catalog.json"), JSON.stringify(items));
  fs.writeFileSync(
    path.join(staging, "assets", "build-info.json"),
    JSON.stringify({ mode, schemaVersion: 1 }),
  );
  return { staging, items };
}
