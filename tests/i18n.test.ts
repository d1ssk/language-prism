import test from "node:test";
import assert from "node:assert/strict";
import { dictionaries, UI_LOCALES, isUiLocale, translate } from "../src/i18n";
import { LANGUAGE_CODES, ORIGINAL_LANGUAGE_CODES, languageName, displayLanguages } from "../src/lib/languages";
test("Japanese and English UI dictionaries have matching keys and placeholders", () => {
  assert.deepEqual(UI_LOCALES, ["ja", "en"]);
  assert.deepEqual(
    Object.keys(dictionaries.ja).sort(),
    Object.keys(dictionaries.en).sort(),
  );
  for (const key of Object.keys(
    dictionaries.ja,
  ) as (keyof typeof dictionaries.ja)[]) {
    assert.deepEqual(
      dictionaries.ja[key].match(/\{\w+\}/g)?.sort(),
      dictionaries.en[key].match(/\{\w+\}/g)?.sort(),
      key,
    );
  }
  assert.equal(translate("en", "units", { count: 2 }), "2 meaning units");
  assert.equal(isUiLocale("ar"), false);
});
test("display order follows the UI locale without mutating canonical language order", () => {
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
  ]);
  assert.deepEqual(displayLanguages("en").map(lang => lang.code), ["en", "ja", "es", "fr", "de", "ru", "ar", "zh", "ko"]);
  assert.deepEqual(displayLanguages("ja").map(lang => lang.code), LANGUAGE_CODES);
  assert.deepEqual(LANGUAGE_CODES.slice(0, 2), ["ja", "en"]);
  assert.equal(languageName("ar", "ja"), "アラビア語");
  assert.equal(languageName("ar", "en"), "Arabic");
  for (const locale of UI_LOCALES) {
    const names = new Intl.ListFormat(locale).format(
      displayLanguages(locale).map(lang => languageName(lang.code, locale)),
    );
    const paragraph = translate(locale, "homeLanguages", { languages: names });
    for (const code of LANGUAGE_CODES)
      assert.ok(paragraph.includes(languageName(code, locale)));
  }
});
test("additional originals follow the UI language while the nine content languages keep their order", () => {
  for (const locale of UI_LOCALES) {
    const normal = displayLanguages(locale).map(lang => lang.code);
    for (const code of ORIGINAL_LANGUAGE_CODES) {
      const actual = displayLanguages(locale, code).map(lang => lang.code);
      assert.equal(actual[0], locale);
      assert.equal(actual[1], code);
      assert.deepEqual(actual.filter(value => value !== code), normal);
      assert.equal(actual.length, 10);
    }
    for (const code of LANGUAGE_CODES)
      assert.deepEqual(displayLanguages(locale, code).map(lang => lang.code), normal);
  }
  assert.equal(LANGUAGE_CODES.length, 9);
});
