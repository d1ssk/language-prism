import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { contentSchema } from "../src/lib/schema";
import { LANGUAGE_CODES } from "../src/lib/languages";
import {
  ROOT,
  privateRoot,
  noSymlink,
  resolveBase,
} from "../scripts/build/paths";
import {
  readCollection,
  assertUnique,
  loadCatalog,
  collectMedia,
} from "../scripts/build/catalog";
import { sample, writeFixture } from "./fixture";

test("nine language codes have a canonical fixed order", () =>
  assert.deepEqual(LANGUAGE_CODES, [
    "ja",
    "en",
    "es",
    "fr",
    "de",
    "ru",
    "ar",
    "zh",
    "ko",
  ]));
test("both scopes use the same schema", () => {
  const work = contentSchema.parse(sample());
  assert.equal(work.schemaVersion, 1);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prism-schema-"));
  try {
    writeFixture(temp);
    assert.equal(readCollection(temp, "public")[0].scope, "public");
    assert.equal(readCollection(temp, "private")[0].scope, "private");
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("Grammar uses the existing article schema and keeps audio paths scoped to the work", () => {
  const work = sample("grammar-example");
  work.type = "grammar";
  for (const unit of work.units)
    for (const [code, entry] of Object.entries(unit.languages))
      entry.audio!.path = `grammar/${work.id}/${unit.id}/${code}.mp3`;
  assert.ok(contentSchema.safeParse(work).success);
  work.units[0].languages.en.audio!.path = `grammar/../${work.id}/u001/en.mp3`;
  assert.ok(!contentSchema.safeParse(work).success);
  work.units[0].languages.en.audio!.path = `practical/${work.id}/u001/en.mp3`;
  assert.ok(!contentSchema.safeParse(work).success);
});
test("Japanese display text is distinct from hiragana TTS", () => {
  const ja = sample().units[0].languages.ja;
  assert.notEqual(ja.text, ja.ttsText);
  assert.match(ja.text, /[一-龯]/);
  assert.doesNotMatch(ja.ttsText!, /[一-龯]/);
});
test("kanji, katakana and numerals in Japanese TTS are rejected", () => {
  for (const input of [
    "漢字です。",
    "カタカナです。",
    "123です。",
    "𠮷です。",
  ]) {
    const work = sample();
    work.units[0].languages.ja.ttsText = input;
    assert.equal(contentSchema.safeParse(work).success, false);
  }
});
test("draft allows missing languages, ready requires nine TTS texts", () => {
  const work = sample();
  delete work.units[0].languages.ko;
  assert.equal(contentSchema.safeParse(work).success, false);
  work.publicationStatus = "draft";
  assert.equal(contentSchema.safeParse(work).success, true);
  work.units[0].languages.ja.ttsText = "漢字";
  assert.equal(contentSchema.safeParse(work).success, false);
});
test("ready content distinguishes an explicit lack of an equivalent from unfinished text", () => {
  const work = sample();
  delete work.units[0].languages.ar;
  delete work.units[0].languages.zh;
  assert.equal(contentSchema.safeParse(work).success, false);
  work.units[0].noEquivalent = {
    ar: { ja: "この場面の定型句は載せません。", en: "No set phrase for this situation is listed." },
    zh: { ja: "使い方が異なります。", en: "Usage differs." },
  };
  assert.equal(contentSchema.safeParse(work).success, true);
  for (const change of [
    (w: any) => { w.units[0].noEquivalent.zh = { ja: "理由" }; },
    (w: any) => { w.units[0].noEquivalent.zh = ""; },
    (w: any) => { w.units[0].noEquivalent.xx = "Unknown language"; },
    (w: any) => { w.units[0].noEquivalent.en = "Conflicts with actual text"; },
    (w: any) => {
      w.units[0].languages = {};
      w.units[0].noEquivalent = Object.fromEntries(LANGUAGE_CODES.map(code => [code, "No text"]));
    },
  ]) {
    const invalid = structuredClone(work);
    change(invalid);
    assert.equal(contentSchema.safeParse(invalid).success, false);
  }
});
test("safe slugs, audio mappings, URLs and known language codes are enforced", () => {
  for (const modify of [
    (w: any) => {
      w.slug = "../secret";
    },
    (w: any) => {
      w.units[0].languages.en.audio.path = "practical/other/u001/en.mp3";
    },
    (w: any) => {
      w.sourceURL = "javascript:alert(1)";
    },
    (w: any) => {
      w.units[0].languages.xx = w.units[0].languages.en;
    },
    (w: any) => {
      w.units[1].id = w.units[0].id;
    },
  ]) {
    const work = sample();
    modify(work);
    assert.equal(contentSchema.safeParse(work).success, false);
  }
});
test("ID and slug collisions are errors across scopes", () => {
  const items = [{ ...sample(), scope: "public" as const, availableAudio: {} }];
  assert.throws(
    () => assertUnique([...items, { ...items[0], scope: "private" }]),
    /重複/,
  );
  assert.throws(
    () =>
      assertUnique([
        ...items,
        { ...items[0], id: "another-id", scope: "private" },
      ]),
    /slug/,
  );
});
test("public catalog never resolves private roots", () => {
  assert.ok(
    loadCatalog("public", {
      privateDirectory: "/not-existing-private-directory",
    }).every((item) => item.scope === "public"),
  );
});
test("private root cannot be in repo or its parent", () => {
  for (const value of [ROOT, path.join(ROOT, "private"), path.dirname(ROOT)])
    assert.throws(
      () => privateRoot({ PRISM_PRIVATE_ROOT: value }),
      /リポジトリ/,
    );
});
test("symlinks and path traversal are rejected", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prism-paths-"));
  try {
    fs.symlinkSync(ROOT, path.join(temp, "link"));
    assert.throws(
      () => noSymlink(temp, path.join(temp, "link/content")),
      /シンボリック/,
    );
    assert.throws(
      () => noSymlink(temp, path.join(temp, "../outside")),
      /許可範囲/,
    );
    assert.throws(
      () =>
        privateRoot({ PRISM_PRIVATE_ROOT: path.join(temp, "link/private") }),
      /リポジトリ/,
    );
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
test("base must be an explicit path, not a URL or traversal", () => {
  assert.equal(resolveBase("/language-prism/"), "/language-prism/");
  for (const input of ["../", "//host/", "https://host/", "/a/../", "/a"])
    assert.throws(() => resolveBase(input));
});
test("missing audio is omitted and mock audio cannot be published", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "prism-audio-"));
  try {
    const item = {
      ...contentSchema.parse(sample()),
      scope: "public" as const,
      availableAudio: {},
    };
    assert.deepEqual(collectMedia([item], temp), []);
    const output = path.join(
      temp,
      "media/public",
      item.units[0].languages.ja.audio!.path,
    );
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, "test audio");
    fs.writeFileSync(
      output + ".json",
      JSON.stringify({ backend: "mock", mock: true }),
    );
    assert.throws(() => collectMedia([item], temp), /mock/);
    fs.rmSync(output + ".json");
    assert.throws(() => collectMedia([item], temp), /生成記録/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("bilingual explanations coexist with legacy strings and require both UI locales", () => {
  const work = sample();
  work.title = { ja: "タイトル", en: "Title" };
  work.units[0].languages.ja.vocabulary = [{ term: "文", meaning: { ja: "文です", en: "A sentence" } }];
  work.units[0].languages.ja.translation.method = "provided";
  work.units[0].languages.ja.references = [{ title: "Reference", url: "https://example.com/grammar" }];
  assert.equal(contentSchema.safeParse(work).success, true);
  assert.equal(contentSchema.safeParse({ ...work, title: { ja: "タイトル" } }).success, false);
  work.units[0].languages.ja.references[0].url = "javascript:alert(1)";
  assert.equal(contentSchema.safeParse(work).success, false);
});


test("ready Arabic and Chinese entries require display pronunciation; drafts can omit it", () => {
  for (const code of ["ar", "zh"]) {
    const work = sample();
    delete work.units[0].languages[code].pronunciation;
    assert.equal(contentSchema.safeParse(work).success, false);
    work.publicationStatus = "draft";
    assert.equal(contentSchema.safeParse(work).success, true);
  }
});
test("pronunciation systems match the language and use Latin tone-marked readings", () => {
  const work = sample();
  work.units[0].languages.zh.pronunciation = { system: "pinyin", text: "Nǐ hǎo. Lüè." };
  assert.equal(contentSchema.safeParse(work).success, true);
  for (const text of ["ni3 hao3", "你好", ""]) {
    work.units[0].languages.zh.pronunciation.text = text;
    assert.equal(contentSchema.safeParse(work).success, false);
  }
  work.units[0].languages.zh.pronunciation = { system: "arabic-romanization", text: "nǐ hǎo" };
  assert.equal(contentSchema.safeParse(work).success, false);
});

function extraOriginalSample(code = "la") {
  const work = sample();
  work.type = "library";
  work.originalLanguage = code;
  for (const unit of work.units) {
    for (const entry of Object.values(unit.languages)) delete entry.audio;
    unit.languages[code] = { ...unit.languages.en, text: "Gallia est omnis divisa in partes tres." };
    delete unit.languages[code].ttsText;
  }
  return work;
}
test("Library accepts a display-only original alongside the nine content languages", () => {
  for (const code of ["grc", "la", "sa", "it"]) {
    const work = extraOriginalSample(code);
    assert.equal(contentSchema.safeParse(work).success, true);
    delete work.units[0].languages[code];
    assert.equal(contentSchema.safeParse(work).success, false);
    work.publicationStatus = "draft";
    assert.equal(contentSchema.safeParse(work).success, true);
  }
});
test("extra originals cannot replace canonical languages or enter unsupported audio paths", () => {
  for (const modify of [
    (w: any) => { w.type = "practical"; },
    (w: any) => { w.originalLanguage = "en"; },
    (w: any) => { w.units[0].languages.it = w.units[0].languages.la; },
    (w: any) => { w.units[0].languages.la.translation.method = "ai-assisted"; },
    (w: any) => { w.units[0].languages.la.audio = { path: `library/${w.id}/u001/la.mp3`, origin: "human", qualityStatus: "unreviewed" }; },
    (w: any) => { delete w.units[0].languages.ko; },
    (w: any) => { delete w.units[0].languages.ja.ttsText; },
  ]) {
    const work = extraOriginalSample();
    modify(work);
    assert.equal(contentSchema.safeParse(work).success, false);
  }
});
