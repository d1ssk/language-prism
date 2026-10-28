import path from "node:path";
import { ROOT } from "../build/paths";
import { readCollection, assertUnique, loadCatalog } from "../build/catalog";
const local = process.argv.includes("--local");
const items = local
  ? loadCatalog("local")
  : readCollection(path.join(ROOT, "content/public"), "public");
assertUnique(items);
console.log(
  `OK: ${items.length} contents / ${items.reduce((n, item) => n + item.units.length, 0)} units (${local ? "local" : "public"})`,
);
