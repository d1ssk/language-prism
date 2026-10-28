import fs from "node:fs";
import path from "node:path";
import { ROOT, privateRoot, noSymlink } from "../build/paths";
const root = privateRoot();
for (const directory of [
  "content/practical",
  "content/grammar",
  "content/library",
  "media/practical",
  "media/grammar",
  "media/library",
  "voices",
]) {
  noSymlink(root, path.join(root, directory));
  fs.mkdirSync(path.join(root, directory), { recursive: true, mode: 0o700 });
}
const env = path.join(ROOT, ".env.local");
if (!fs.existsSync(env))
  fs.writeFileSync(env, fs.readFileSync(path.join(ROOT, ".env.example")), {
    flag: "wx",
    mode: 0o600,
  });
console.log(
  `Local data initialized: ${root}\n既存ファイルは上書きしていません。npm run dev:local で閲覧できます。`,
);
