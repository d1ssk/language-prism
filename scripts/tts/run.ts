import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { ROOT, localSettings, privateRoot, noSymlink } from "../build/paths";
import { readCollection, assertUnique } from "../build/catalog";
import { LANGUAGE_CODES } from "../../src/lib/languages";
const { values } = parseArgs({
  options: {
    work: { type: "string" },
    unit: { type: "string" },
    lang: { type: "string" },
    scope: { type: "string", default: "private" },
    backend: { type: "string", default: "mlx" },
    model: { type: "string" },
    "model-revision": { type: "string", default: "main" },
    ref: { type: "string" },
    seed: { type: "string", default: "42" },
    "max-tokens": { type: "string", default: "1000" },
    temperature: { type: "string", default: "0.8" },
    force: { type: "boolean" },
    "dry-run": { type: "boolean" },
  },
});
if (!values.work) throw new Error("--work ID を指定してください");
if (!["public", "private"].includes(values.scope!))
  throw new Error("--scope public|private");
if (!["mlx", "torch", "mock"].includes(values.backend!))
  throw new Error("--backend mlx|torch|mock");
const languages = values.lang ? values.lang.split(",") : LANGUAGE_CODES;
if (
  languages.some(
    (code) => !LANGUAGE_CODES.includes(code as (typeof LANGUAGE_CODES)[number]),
  )
)
  throw new Error("--lang は ja,en,es,fr,de,ru,ar,zh,ko から選んでください");
const settings = localSettings();
const storage = values.scope === "public" ? ROOT : privateRoot(settings);
const contentRoot = path.join(
  storage,
  values.scope === "public" ? "content/public" : "content",
);
noSymlink(storage, contentRoot);
const items = readCollection(contentRoot, values.scope as "public" | "private");
assertUnique(items);
const work = items.find((work) => work.id === values.work);
if (!work) throw new Error("指定された教材がありません");
const units = values.unit
  ? work.units.filter((unit) => unit.id === values.unit)
  : work.units;
if (!units.length) throw new Error("指定されたunitがありません");
const outputRoot =
  values.backend === "mock"
    ? path.join(ROOT, ".cache/tts-mock", values.scope!)
    : path.join(storage, values.scope === "public" ? "media/public" : "media");
noSymlink(values.backend === "mock" ? ROOT : storage, outputRoot);
const jobs = units.flatMap((unit) =>
  LANGUAGE_CODES.filter((code) => languages.includes(code)).flatMap((code) => {
    const entry = unit.languages[code];
    if (!entry) {
      if (unit.noEquivalent?.[code]) return [];
      if (values.lang) throw new Error(`${unit.id}/${code} の本文がありません`);
      return [];
    }
    const text = entry.ttsText || (code !== "ja" ? entry.text : "");
    if (!text) throw new Error(`${unit.id}/ja: 日本語の ttsText が必要です`);
    const relative = `${work.type}/${work.id}/${unit.id}/${code}.mp3`;
    const output = path.join(outputRoot, relative);
    noSymlink(values.backend === "mock" ? ROOT : storage, output);
    noSymlink(values.backend === "mock" ? ROOT : storage, `${output}.json`);
    return [{ unit: unit.id, language: code, text, relative, output }];
  }),
);
if (!jobs.length) throw new Error("生成する本文がありません");
const params = {
  seed: Number(values.seed),
  max_tokens: Number(values["max-tokens"]),
  temperature: Number(values.temperature),
};
if (
  !Number.isSafeInteger(params.seed) ||
  !Number.isSafeInteger(params.max_tokens) ||
  params.max_tokens < 1 ||
  !Number.isFinite(params.temperature) ||
  params.temperature <= 0
)
  throw new Error("生成パラメータが不正です");
const defaultPython = path.join(ROOT, "_misc/voice_test/.venv/bin/python");
const python = settings.PRISM_TTS_PYTHON
  ? path.resolve(ROOT, settings.PRISM_TTS_PYTHON)
  : fs.existsSync(defaultPython)
    ? defaultPython
    : "python3";
const hfHome = path.resolve(
  ROOT,
  settings.PRISM_TTS_HF_HOME || "_misc/voice_test/.cache/huggingface",
);
const ref = values.ref || settings.PRISM_TTS_REFERENCE;
const fallbackRef = path.join(
  ROOT,
  "_misc/voice_test/references/chatterbox_default.wav",
);
const reference = ref
  ? path.resolve(ROOT, ref)
  : fs.existsSync(fallbackRef)
    ? fallbackRef
    : null;
const plan = {
  backend: values.backend,
  model:
    values.model ||
    (values.backend === "torch"
      ? "ResembleAI/chatterbox"
      : "mlx-community/chatterbox-multilingual-v3"),
  revision: values["model-revision"],
  params,
  reference,
  contentPath: path.join(contentRoot, work.type, work.id, "content.json"),
  jobs,
  force: !!values.force,
  dryRun: !!values["dry-run"],
};
const result = spawnSync(python, [path.join(ROOT, "scripts/tts/generate.py")], {
  cwd: ROOT,
  input: JSON.stringify(plan),
  stdio: ["pipe", "inherit", "inherit"],
  env: {
    ...process.env,
    ...(settings.PRISM_FFMPEG
      ? { PRISM_FFMPEG: path.resolve(ROOT, settings.PRISM_FFMPEG) }
      : {}),
    HF_HOME: hfHome,
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    HF_HUB_DISABLE_TELEMETRY: "1",
    TOKENIZERS_PARALLELISM: "false",
    PYTHONDONTWRITEBYTECODE: "1",
  },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
