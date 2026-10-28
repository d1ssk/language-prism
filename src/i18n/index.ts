import ja from "./ja";
import en from "./en";
export const UI_LOCALES = ["ja", "en"] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export const DEFAULT_LOCALE: UiLocale = "ja";
export const dictionaries = { ja, en };
export type MessageKey = keyof typeof ja;
export function isUiLocale(value: string | undefined): value is UiLocale {
  return UI_LOCALES.includes(value as UiLocale);
}
export function translate(
  locale: UiLocale,
  key: MessageKey,
  values: Record<string, string | number> = {},
) {
  return dictionaries[locale][key].replace(
    /\{(\w+)\}/g,
    (match, name: string) => String(values[name] ?? match),
  );
}
