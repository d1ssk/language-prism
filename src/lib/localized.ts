import type { UiLocale } from '../i18n';
export type LocalizedText = string | Record<UiLocale, string>;
export function localize(value: LocalizedText, locale: UiLocale): string {
  return typeof value === 'string' ? value : value[locale];
}
