import definitions from "../../config/languages.json";
import originalDefinitions from "../../config/original-languages.json";
export const ORIGINAL_LANGUAGES = originalDefinitions;
export const ORIGINAL_LANGUAGE_CODES = originalDefinitions.map(item => item.code);
export const LANGUAGES = definitions;
export type LanguageCode =
  "ja" | "en" | "es" | "fr" | "de" | "ru" | "ar" | "zh" | "ko";
export const LANGUAGE_CODES = definitions.map(
  (item) => item.code,
) as LanguageCode[];
export const languageName = (code: string, locale: "ja" | "en" = "ja") =>
  locale === "en"
    ? (new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code)
    : (definitions.find((item) => item.code === code)?.label ?? code);

// Display/playback order is locale-specific; the canonical data/TTS order stays intact.
export const displayLanguages = (locale: "ja" | "en", originalCode?: string) => {
  const languages = locale === "en"
    ? [...definitions.filter(item => item.code === "en"), ...definitions.filter(item => item.code !== "en")]
    : [...definitions];
  const original = originalDefinitions.find(item => item.code === originalCode);
  if (original) languages.splice(1, 0, { ...original, label: original.native });
  return languages;
};
