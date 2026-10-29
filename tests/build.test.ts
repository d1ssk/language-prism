import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ROOT } from "../scripts/build/paths";
import { checkPrivacy, walk } from "../scripts/build/privacy";
import { sample } from "./fixture";
function build(mode: "public" | "local", env: Record<string, string>) {
  const run = spawnSync(
    process.execPath,
    ["--import", "tsx", "scripts/build/run.ts", "build", mode],
    {
      cwd: ROOT,
      env: { ...process.env, ...env },
      encoding: "utf8",
      timeout: 120_000,
    },
  );
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
}
function fixture(id: string, marker: string) {
  const item = sample();
  item.id = item.slug = id;
  item.title = marker;
  item.description = marker + "-description";
  item.tags = [marker + "-tag"];
  item.units.forEach((unit: any) => {
    unit.languages.en.text = marker + "-body";
    unit.languages.en.notes = [marker + "-notes"];
    Object.values(unit.languages).forEach((entry: any) => {
      delete entry.audio;
    });
  });
  item.units[0].languages.en.audio = {
    path: `practical/${id}/u001/en.mp3`,
    origin: "human",
    qualityStatus: "unreviewed",
  };
  return item;
}
test(
  "real local/public builds isolate private text, metadata and audio; added content is automatic",
  { timeout: 240_000 },
  () => {
    const privateDir = fs.mkdtempSync(path.join(os.tmpdir(), "prism-private-"));
    const token = Date.now().toString(36);
    const privateId = `secret-${token}`;
    const publicId = `added-${token}`;
    const marker = `PRIVATE_CANARY_${token}`;
    const privateWork = fixture(privateId, marker);
    const grammarId = `grammar-${token}`;
    const privateGrammar = fixture(grammarId, marker + "-grammar");
    privateGrammar.type = "grammar";
    privateGrammar.units[0].languages.en.audio!.path = `grammar/${grammarId}/u001/en.mp3`;
    const publicWork = fixture(publicId, "Automatically added content");
    const publicFolder = path.join(ROOT, "content/public/practical", publicId);
    const ignoredAsset = path.join(ROOT, "public", `ignored-${token}.txt`);
    try {
      const contentFolder = path.join(
        privateDir,
        "content/practical",
        privateId,
      );
      fs.mkdirSync(contentFolder, { recursive: true });
      fs.writeFileSync(
        path.join(contentFolder, "content.json"),
        JSON.stringify(privateWork),
      );
      const grammarFolder = path.join(privateDir, "content/grammar", grammarId);
      fs.mkdirSync(grammarFolder, { recursive: true });
      fs.writeFileSync(path.join(grammarFolder, "content.json"), JSON.stringify(privateGrammar));
      const audio = path.join(
        privateDir,
        "media",
        privateWork.units[0].languages.en.audio!.path,
      );
      fs.mkdirSync(path.dirname(audio), { recursive: true });
      fs.writeFileSync(audio, "PRIVATE_AUDIO_" + token);
      fs.mkdirSync(publicFolder, { recursive: true });
      fs.writeFileSync(
        path.join(publicFolder, "content.json"),
        JSON.stringify(publicWork),
      );
      fs.writeFileSync(ignoredAsset, marker + "-not-allowlisted");
      build("local", {
        PRISM_PRIVATE_ROOT: privateDir,
        PRISM_BASE: "/language-prism/",
      });
      const localHTML = fs.readFileSync(
        path.join(ROOT, "dist/local/ja/read", privateId, "index.html"),
        "utf8",
      );
      assert.ok(localHTML.includes(marker));
      assert.ok(localHTML.includes("非公開"));
      const localEnglish = fs.readFileSync(
        path.join(ROOT, "dist/local/en/read", privateId, "index.html"),
        "utf8",
      );
      assert.ok(localEnglish.includes(marker));
      assert.ok(localEnglish.includes("Private"));
      assert.ok(fs.readFileSync(path.join(ROOT, "dist/local/ja/grammar/index.html"), "utf8").includes(marker + "-grammar"));
      assert.ok(fs.readFileSync(path.join(ROOT, "dist/local/en/read", grammarId, "index.html"), "utf8").includes(marker + "-grammar"));
      assert.ok(
        localEnglish.includes(
          'href="/language-prism/ja/read/' + privateId + '/"',
        ),
      );

      assert.ok(
        localHTML.includes(
          `/language-prism/media/private/practical/${privateId}/u001/en.mp3`,
        ),
      );
      assert.ok(
        fs.existsSync(
          path.join(
            ROOT,
            "dist/local/media/private",
            privateWork.units[0].languages.en.audio!.path,
          ),
        ),
      );
      assert.ok(
        fs
          .readFileSync(
            path.join(ROOT, "dist/local/ja/practical/index.html"),
            "utf8",
          )
          .includes(marker),
      );
      build("public", {
        PRISM_PRIVATE_ROOT: privateDir,
        PRISM_BASE: "/language-prism/",
      });
      checkPrivacy(path.join(ROOT, "dist/public"), [
        marker,
        privateId,
        grammarId,
        "PRIVATE_AUDIO_" + token,
      ]);
      assert.ok(
        fs.existsSync(
          path.join(ROOT, "dist/public/ja/read", publicId, "index.html"),
        ),
      );
      assert.ok(!fs.existsSync(path.join(ROOT, "dist/public/media/private")));
      assert.ok(
        !fs.existsSync(
          path.join(ROOT, "dist/public", path.basename(ignoredAsset)),
        ),
      );
      assert.ok(
        walk(path.join(ROOT, "dist/public")).every(
          (file) => !file.endsWith(".map"),
        ),
      );
      const html = fs.readFileSync(
        path.join(ROOT, "dist/public/ja/read", publicId, "index.html"),
        "utf8",
      );
      assert.match(
        html,
        /disabled[^>]*data-audio-key|data-audio-key[^>]*disabled/,
      );
      assert.ok(html.includes("音声未生成"));
      assert.ok(html.includes('dir="rtl"'));
      assert.ok(html.includes('href="/language-prism/ja/practical/"'));
      const englishHTML = fs.readFileSync(
        path.join(ROOT, "dist/public/en/read", publicId, "index.html"),
        "utf8",
      );
      assert.ok(englishHTML.includes('lang="en"'));
      assert.ok(englishHTML.includes("No audio yet"));
      assert.ok(englishHTML.includes("Source, rights and credits"));
      assert.ok(!englishHTML.includes("音声未生成"));
      assert.ok(englishHTML.includes('href="/language-prism/en/practical/"'));
      assert.ok(
        englishHTML.includes(
          'href="/language-prism/ja/read/' + publicId + '/"',
        ),
      );
      for (const locale of ["ja", "en"]) {
        const home = fs.readFileSync(
          path.join(ROOT, "dist/public", locale, "index.html"),
          "utf8",
        );
        assert.ok(home.includes(`href="/language-prism/${locale}/practical/"`));
        assert.ok(home.includes(`href="/language-prism/${locale}/grammar/"`));
        assert.ok(home.includes(`href="/language-prism/${locale}/library/"`));
        assert.ok(home.indexOf(`/${locale}/practical/`) < home.indexOf(`/${locale}/grammar/`));
        assert.ok(home.indexOf(`/${locale}/grammar/`) < home.indexOf(`/${locale}/library/`));
        const grammar = fs.readFileSync(path.join(ROOT, "dist/public", locale, "grammar/index.html"), "utf8");
        assert.ok(grammar.includes(`href="/language-prism/${locale}/read/existence-and-location/"`));
        assert.ok(grammar.includes(`href="/language-prism/${locale === 'ja' ? 'en' : 'ja'}/grammar/"`));
        const grammarArticle = fs.readFileSync(path.join(ROOT, "dist/public", locale, "read/existence-and-location/index.html"), "utf8");
        assert.ok(grammarArticle.includes(`href="/language-prism/${locale}/grammar/"`));
        assert.ok(grammarArticle.includes('src="/language-prism/media/public/grammar/existence-and-location/u001/ja.mp3"'));
        assert.ok(!grammarArticle.includes('/media/private/'));
        assert.ok(home.includes(`href="/language-prism/${locale}/guide/"`));
        const guide = fs.readFileSync(path.join(ROOT, "dist/public", locale, "guide/index.html"), "utf8");
        assert.ok(guide.includes('id="arabic"'));
        assert.ok(guide.includes('id="pinyin"'));
        assert.ok(guide.includes(`href="/language-prism/${locale === "ja" ? "en" : "ja"}/guide/"`));
      }
      const entry = fs.readFileSync(
        path.join(ROOT, "dist/public/index.html"),
        "utf8",
      );
      assert.ok(entry.includes("0;url=/language-prism/ja/"));
    } finally {
      fs.rmSync(publicFolder, { recursive: true, force: true });
      fs.rmSync(ignoredAsset, { force: true });
      fs.rmSync(privateDir, { recursive: true, force: true });
      fs.rmSync(path.join(ROOT, "dist/local"), {
        recursive: true,
        force: true,
      });
      fs.rmSync(path.join(ROOT, ".generated/local"), {
        recursive: true,
        force: true,
      });
    }
  },
);
test(
  "public build works without private data and ignores a local-mode environment",
  { timeout: 120_000 },
  () => {
    build("public", {
      PRISM_PRIVATE_ROOT: path.join(os.tmpdir(), "does-not-exist-prism"),
      PRISM_MODE: "local",
      PRISM_BASE: "/",
    });
    const index = fs.readFileSync(
      path.join(ROOT, "dist/public/ja/practical/index.html"),
      "utf8",
    );
    assert.ok(!index.includes("PRIVATE_CANARY_"));
    assert.ok(!fs.existsSync(path.join(ROOT, "dist/public/search-index.json")));
    assert.equal(
      JSON.parse(
        fs.readFileSync(path.join(ROOT, "dist/public/build-info.json"), "utf8"),
      ).mode,
      "public",
    );
  },
);
