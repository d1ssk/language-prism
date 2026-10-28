import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function localSettings(): Record<string, string | undefined> {
  const file = path.join(ROOT, ".env.local");
  return {
    ...(fs.existsSync(file) ? parseEnv(fs.readFileSync(file, "utf8")) : {}),
    ...process.env,
  };
}
export function inside(root: string, candidate: string) {
  const rel = path.relative(root, candidate);
  return (
    rel === "" ||
    (!rel.startsWith(`..${path.sep}`) && rel !== ".." && !path.isAbsolute(rel))
  );
}
export function privateRoot(settings = localSettings()): string {
  const requested = path.resolve(
    ROOT,
    settings.PRISM_PRIVATE_ROOT || "../language-prism-private",
  );
  // Resolve even an uncreated directory through its nearest existing ancestor.
  let parent = requested;
  const tail: string[] = [];
  while (!fs.existsSync(parent)) {
    tail.unshift(path.basename(parent));
    parent = path.dirname(parent);
  }
  const resolved = path.resolve(fs.realpathSync(parent), ...tail);
  const realRoot = fs.realpathSync(ROOT);
  if (inside(realRoot, resolved) || inside(resolved, realRoot))
    throw new Error(
      "非公開ルートはリポジトリの外（親ディレクトリも不可）に配置してください",
    );
  return resolved;
}
export function noSymlink(root: string, candidate: string): void {
  const target = path.resolve(candidate);
  if (!inside(path.resolve(root), target))
    throw new Error(`許可範囲外のパス: ${candidate}`);
  let current = path.resolve(root);
  const parts = path.relative(current, target).split(path.sep).filter(Boolean);
  for (const part of ["", ...parts]) {
    if (part) current = path.join(current, part);
    if (
      fs.existsSync(current) ||
      fs.lstatSync(current, { throwIfNoEntry: false })
    ) {
      if (fs.lstatSync(current).isSymbolicLink())
        throw new Error(`シンボリックリンクは入力に使えません: ${current}`);
    }
  }
}
export function resolveBase(value = process.env.PRISM_BASE || "/") {
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(value))
    throw new Error(
      "PRISM_BASE は / または /language-prism/ の形式にしてください",
    );
  return value;
}
