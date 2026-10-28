// Build/server only: never import this module from client scripts.
import fs from "node:fs";
import path from "node:path";
import type { CatalogEntry } from "./schema";
export const mode = process.env.PRISM_MODE === "local" ? "local" : "public";
export function getCatalog(): CatalogEntry[] {
  return JSON.parse(
    fs.readFileSync(path.resolve(".generated", mode, "catalog.json"), "utf8"),
  );
}
export const withBase = (relative: string) =>
  `${import.meta.env.BASE_URL.replace(/\/$/, "")}/${relative.replace(/^\//, "")}`;
