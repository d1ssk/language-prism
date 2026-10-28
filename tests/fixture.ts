// Synthetic schema data, never included in the site's content directories except during tests.
import fs from "node:fs";
import path from "node:path";
import { LANGUAGE_CODES } from "../src/lib/languages";
import { contentSchema } from "../src/lib/schema";
export function sample(id = "test-content") {
  return contentSchema.parse({
    schemaVersion: 1,
    id,
    slug: id,
    type: "practical",
    title: "Schema test",
    description: "Synthetic test data",
    originalLanguage: "ja",
    author: "Test",
    sourceTitle: "Test",
    sourceURL: "",
    rights: "Test fixture",
    license: "Test only",
    attribution: "Test",
    tags: ["test"],
    publicationStatus: "ready",
    createdAt: "2026-10-27",
    updatedAt: "2026-10-27",
    units: ["u001", "u002"].map((unit) => ({
      id: unit,
      languages: Object.fromEntries(
        LANGUAGE_CODES.map((code) => [
          code,
          {
            text: code === "ja" ? "試験です。" : `Test ${code}.`,
            ttsText: code === "ja" ? "しけんです。" : `Test ${code}.`,
            ...(code === "ar" ? { pronunciation: { system: "arabic-romanization", text: "marḥaban" } }
              : code === "zh" ? { pronunciation: { system: "pinyin", text: "Nǐ hǎo." } } : {}),
            vocabulary: [],
            grammar: [],
            notes: [],
            translation: {
              method: "original",
              reviewStatus: "unreviewed",
              attribution: "Test",
            },
            audio: {
              path: `practical/${id}/${unit}/${code}.mp3`,
              origin: "chatterbox",
              qualityStatus: "unreviewed",
            },
          },
        ]),
      ),
    })),
  });
}
export function writeFixture(root: string, id = "test-content") {
  const work = sample(id);
  const folder = path.join(root, work.type, work.id);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "content.json"), JSON.stringify(work));
  return work;
}
