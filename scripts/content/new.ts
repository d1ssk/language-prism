import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { ROOT, privateRoot, noSymlink } from "../build/paths";
import { safeId, contentSchema } from "../../src/lib/schema";
const { values } = parseArgs({
  options: {
    id: { type: "string" },
    type: { type: "string", default: "practical" },
    scope: { type: "string", default: "private" },
  },
});
const id = safeId.parse(values.id);
if (
  !["practical", "grammar", "library"].includes(values.type!) ||
  !["public", "private"].includes(values.scope!)
)
  throw new Error("type/scope が不正です");
const root =
  values.scope === "public"
    ? path.join(ROOT, "content/public")
    : path.join(privateRoot(), "content");
const folder = path.join(root, values.type!, id);
noSymlink(values.scope === "public" ? ROOT : privateRoot(), folder);
const today = new Date().toISOString().slice(0, 10);
const sample = contentSchema.parse({
  schemaVersion: 1,
  id,
  slug: id,
  type: values.type,
  title: "新しい教材",
  description: "内容を記入してください",
  originalLanguage: "ja",
  author: "作者を記入",
  sourceTitle: "出典を記入",
  sourceURL: "",
  rights: "権利を確認して記入",
  license: "未設定",
  attribution: "帰属を記入",
  tags: [],
  publicationStatus: "draft",
  createdAt: today,
  updatedAt: today,
  units: [{ id: "u001", languages: {} }],
});
fs.mkdirSync(folder, { recursive: true });
fs.writeFileSync(
  path.join(folder, "content.json"),
  JSON.stringify(sample, null, 2) + "\n",
  { flag: "wx" },
);
console.log(`Created draft: ${path.join(folder, "content.json")}`);
