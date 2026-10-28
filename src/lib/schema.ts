import { z } from "zod";
import { LANGUAGE_CODES, ORIGINAL_LANGUAGE_CODES } from "./languages";

export const safeId = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const nonempty = z.string().trim().min(1);
// UI-facing prose may be bilingual; existing plain strings remain valid.
export const localizedTextSchema = z.union([
  nonempty,
  z.object({ ja: nonempty, en: nonempty }).strict(),
]);
const language = z.enum(
  LANGUAGE_CODES as [
    (typeof LANGUAGE_CODES)[number],
    ...(typeof LANGUAGE_CODES)[number][],
  ],
);
const safeURL = z
  .string()
  .refine(
    (value) =>
      value === "" || (/^https?:\/\//.test(value) && URL.canParse(value)),
    "HTTP(S) URL または空文字を指定してください",
  );
const reviewStatus = z.enum(["unreviewed", "reviewed"]);
const audioSchema = z
  .object({
    path: z
      .string()
      .regex(/^(practical|grammar|library)\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z]{2}\.mp3$/),
    origin: z.enum(["chatterbox", "human"]),
    qualityStatus: reviewStatus,
  })
  .strict();
const pronunciationSchema = z.object({
  system: z.enum(["arabic-romanization", "pinyin"]),
  text: nonempty.regex(/^[\p{Script=Latin}\p{M}\p{P}\p{Z}\sʿʾ]+$/u, "読みはラテン文字と発音記号で記入してください（数字による声調表記は不可）"),
  note: localizedTextSchema.optional(),
}).strict();
export const translationSchema = z
  .object({
    text: nonempty,
    ttsText: nonempty.optional(),
    pronunciation: pronunciationSchema.optional(),
    vocabulary: z.array(
      z.object({ term: nonempty, meaning: localizedTextSchema }).strict(),
    ),
    grammar: z.array(
      z.object({ point: localizedTextSchema, explanation: localizedTextSchema }).strict(),
    ),
    notes: z.array(localizedTextSchema),
    references: z.array(z.object({ title: nonempty, url: nonempty.refine(url => /^https?:\/\//.test(url) && URL.canParse(url)) }).strict()).optional(),
    translation: z
      .object({
        method: z.enum(["original", "human", "ai-assisted", "provided"]),
        reviewStatus,
        attribution: nonempty,
      })
      .strict(),
    audio: audioSchema.optional(),
  })
  .strict();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s),
    "有効な日付を指定してください",
  );
export const contentSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: safeId,
    slug: safeId,
    type: z.enum(["practical", "grammar", "library"]),
    title: localizedTextSchema,
    description: localizedTextSchema,
    originalLanguage: z.union([language, z.enum(ORIGINAL_LANGUAGE_CODES as [string, ...string[]])]),
    author: nonempty,
    bibliography: z.object({
      originalTitle: nonempty,
      originalAuthor: nonempty,
      title: localizedTextSchema,
      author: localizedTextSchema,
    }).strict().optional(),
    sourceTitle: nonempty,
    sourceURL: safeURL,
    rights: localizedTextSchema,
    license: nonempty,
    attribution: localizedTextSchema,
    editorialNote: localizedTextSchema.optional(),
    excerpt: z
      .object({ isExcerpt: z.boolean(), location: localizedTextSchema.or(z.literal("")) })
      .strict()
      .optional(),
    tags: z.array(nonempty),
    difficulty: z.string().optional(),
    publicationStatus: z.enum(["draft", "review", "ready"]),
    createdAt: date,
    updatedAt: date,
    units: z
      .array(
        z
          .object({
            id: safeId,
            heading: localizedTextSchema.optional(),
            languages: z.record(z.string(), translationSchema),
            noEquivalent: z.record(z.string(), localizedTextSchema).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((work, ctx) => {
    const ids = new Set<string>();
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: "custom", path, message });
    if (ORIGINAL_LANGUAGE_CODES.includes(work.originalLanguage) && work.type !== "library")
      issue(["originalLanguage"], "追加原語はLibrary専用です");
    if (work.updatedAt < work.createdAt)
      issue(["updatedAt"], "作成日より前の更新日は指定できません");
    work.units.forEach((unit, i) => {
      if (ids.has(unit.id))
        issue(["units", i, "id"], "unit ID が重複しています");
      ids.add(unit.id);
      for (const code of Object.keys(unit.noEquivalent ?? {})) {
        if (!LANGUAGE_CODES.includes(code as (typeof LANGUAGE_CODES)[number]))
          issue(["units", i, "noEquivalent", code], "対応する表現がない理由は9言語のコードで指定してください");
        if (unit.languages[code])
          issue(["units", i, "noEquivalent", code], "本文と対応表現なしの理由は同時に指定できません");
      }
      if (work.publicationStatus === "ready" && !Object.keys(unit.languages).length)
        issue(["units", i, "languages"], "ready の意味単位には少なくとも1言語の本文が必要です");
      for (const [code, entry] of Object.entries(unit.languages)) {
        const p = ["units", i, "languages", code];
        const extraOriginal = ORIGINAL_LANGUAGE_CODES.includes(code) && code === work.originalLanguage && work.type === "library";
        if (!LANGUAGE_CODES.includes(code as (typeof LANGUAGE_CODES)[number]) && !extraOriginal)
          issue(p, "未対応の言語コードです");
        if (extraOriginal && entry.translation.method !== "original")
          issue([...p, "translation", "method"], "追加原語には原文を指定してください");
        if (extraOriginal && entry.audio)
          issue([...p, "audio"], "追加原語は表示専用です");
        const expectedSystem = code === "ar" ? "arabic-romanization" : code === "zh" ? "pinyin" : undefined;
        if (entry.pronunciation && entry.pronunciation.system !== expectedSystem)
          issue([...p, "pronunciation", "system"], "読みの方式が本文の言語と一致しません");
        if (work.publicationStatus === "ready" && expectedSystem && !entry.pronunciation)
          issue([...p, "pronunciation"], "ready のアラビア語・中国語には読みの表記が必要です");
        if (
          code === "ja" &&
          entry.ttsText &&
          !/^[\p{Script=Hiragana}\p{P}\p{Z}\sー]+$/u.test(entry.ttsText)
        )
          issue(
            [...p, "ttsText"],
            "日本語 ttsText はひらがな・句読点・空白のみ（漢字等を検出）",
          );
        if (
          entry.audio &&
          entry.audio.path !== `${work.type}/${work.id}/${unit.id}/${code}.mp3`
        )
          issue(
            [...p, "audio", "path"],
            "音声パスは type/id/unit/code.mp3 と一致させてください",
          );
      }
      if (work.publicationStatus === "ready") {
        if (ORIGINAL_LANGUAGE_CODES.includes(work.originalLanguage) && !unit.languages[work.originalLanguage])
          issue(["units", i, "languages", work.originalLanguage], "ready には追加原語の本文が必要です");
        for (const code of LANGUAGE_CODES) {
          const entry = unit.languages[code];
          if (!entry) {
            if (!unit.noEquivalent?.[code])
              issue(["units", i, "languages", code], "ready には9言語の本文または対応表現がない理由が必要です");
          }
          else if (!entry.ttsText)
            issue(
              ["units", i, "languages", code, "ttsText"],
              "ready には ttsText が必要です",
            );
        }
      }
    });
  });
export type Content = z.infer<typeof contentSchema>;
export type Translation = z.infer<typeof translationSchema>;
export type Scope = "public" | "private";
export type Mode = "public" | "local";
export type CatalogEntry = Content & {
  scope: Scope;
  availableAudio: Record<string, string>;
};
