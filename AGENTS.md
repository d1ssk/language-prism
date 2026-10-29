# Development rules

- Site title is `language prism`. Preserve existing data formats.
- `config/languages.json` is the single source of truth for ja, en, es, fr, de, ru, ar, zh, ko in that order; UI, validation and Python TTS read it.
- UI locales are ja/en under `src/pages/[locale]/`; copy belongs in `src/i18n/ja.ts` and `en.ts`. Keep UI locales distinct from the nine content languages. Share content/media across both UI locales and preserve base paths and same-page language switches.
- Keep display `text` separate from `ttsText`. Japanese TTS must use reviewed hiragana input, never fall back to kanji display text.
- Raw private content, media and voices belong outside the repository. Public builds must never read private roots or `.env.local`. Use only explicit public content and referenced media; reject symlinks and path traversal.
- Public staging/output/cache and local staging/output/cache are separate. `npm run build` is always public. Never broaden the Pages upload beyond `dist/public`.
- Do not modify `_misc/voice_test` or the linked `d1ssk.github.io` site. Reuse the working TTS virtual environment and model cache without reinstalling them.
- Audio generation is an independent offline command, never a build step. Mock outputs must remain under an ignored test directory and must not be published.
- Run `npm run check`, `npm run validate:content`, `npm test`, `npm run build:public`, `npm run build:local`, and `npm run privacy:check` for relevant changes. Documentation-only handoff updates do not require this suite.
- Do not commit, push, or deploy without explicit user instruction. Keep secrets, reference voices and machine-specific paths out of tracked files.
- Arabic and Chinese explanations start with `pronunciation` before vocabulary/grammar. Ready entries require `arabic-romanization` for ar (learner-oriented MSA Latin transcription; ā/ī/ū, ḥ/ṣ/ḍ/ṭ/ẓ, ʿ/ʾ, sh/kh/th/dh/gh; explain gender, liaison and pausal choices) and `pinyin` for zh (tone-marked Standard Mandarin, underlying tones, neutral tones unmarked, explain sandhi). Keep this display-only reading separate from `text` and `ttsText`; follow docs/CONTENT_FORMAT.md.
- Pronunciation notes contain only sentence-specific observations (e.g. actual sandhi, gender variants, or pausal forms in that sentence). Do not repeat general transcription conventions, symbol legends, underlying-tone policy or neutral-tone notation under readings. Chinese reading headings are `拼音` / `Pinyin`.
- Shared pronunciation conventions, symbol legends and general references belong in the bilingual public study guide (`/ja/guide/`, `/en/guide/`), linked from the home page. Do not repeat these references in each sentence; retain sentence-specific grammar references where relevant.

# Explanation editing

- Follow `docs/CONTENT_FORMAT.md` for editorial quality and `docs/DEVELOPMENT.md` for ledger operations. Unresolved source-text and pronunciation concerns are in `docs/CONTENT_REVIEW.md`.
- Preserve completed explanations and their accepted detail and bilingual coverage. Do not restart, shorten, or re-review completed entries without a requested change.
- Compose directly in batches, checking source correspondence and Japanese/English consistency during composition. Inspect failed, uncertain, or changed portions; do not routinely repeat full rereads, research, or polish passes.
- Mark ledger entries `checked` only after an actual content check. Generation or passing a script alone is not evidence of that check. Never reset the ledger baseline or mark unfinished entries complete to speed up progress.
- Research only uncertainty essential to explaining the actual sentence. Record nonblocking source-text or pronunciation concerns once; do not invent facts or citations.
