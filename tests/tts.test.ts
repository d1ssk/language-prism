import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { writeFixture } from "./fixture";
import { spawnSync } from "node:child_process";
import { ROOT } from "../scripts/build/paths";
test("Python adapters: cache invalidation, failure preservation, mock and offline dry run", () => {
  const run = spawnSync("python3", ["-B", "tests/test_tts.py", "-v"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
});
test("TTS CLI passes hiragana and an explicit language without loading the model", () => {
  const id = `tts-test-${Date.now().toString(36)}`;
  writeFixture(path.join(ROOT, "content/public"), id);
  try {
    const run = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/tts/run.ts",
        "--scope",
        "public",
        "--work",
        id,
        "--unit",
        "u001",
        "--lang",
        "ja",
        "--dry-run",
      ],
      { cwd: ROOT, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /しけんです/);
    assert.match(run.stdout, /u001\/ja/);
    assert.match(run.stdout, /DRY RUN/);
  } finally {
    fs.rmSync(path.join(ROOT, "content/public/practical", id), {
      recursive: true,
      force: true,
    });
  }
});
test("TTS skips a no-equivalent explanation even for an explicitly selected language", () => {
  const id = `tts-omission-${Date.now().toString(36)}`;
  const work = writeFixture(path.join(ROOT, "content/public"), id);
  const folder = path.join(ROOT, "content/public/practical", id);
  delete work.units[0].languages.en;
  work.units[0].noEquivalent = { en: "EXPLANATION_NOT_FOR_TTS" };
  fs.writeFileSync(path.join(folder, "content.json"), JSON.stringify(work));
  try {
    const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/tts/run.ts", "--scope", "public", "--work", id, "--lang", "en", "--dry-run"], { cwd: ROOT, encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /u002\/en/);
    assert.doesNotMatch(run.stdout, /u001\/en|EXPLANATION_NOT_FOR_TTS/);
    assert.match(run.stdout, /DRY RUN/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
