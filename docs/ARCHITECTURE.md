# Architecture

## ディレクトリの責務

| 場所 | 内容 |
|---|---|
| `src/pages/[locale]/` | 日英共通のホーム、Practical / Grammar / Library一覧、静的教材ページ |
| `src/pages/` | 旧URLから日本語版への移動 |
| `src/i18n/` | 日英のホーム本文・画面文言とUI言語定義 |
| `src/layouts/`, `src/components/` | 両モードで共通のレイアウト・言語表示 |
| `src/lib/schema.ts` | Zodスキーマと推論したTypeScript型 |
| `src/lib/reader.ts` | ブラウザ内の個別・意味単位・記事全体の音声キュー |
| `config/languages.json` | 言語のコード・固定順序・名称・方向 |
| `content/public/<type>/<id>/content.json` | 公開候補の本文・解説・権利・音声参照 |
| `media/public/<type>/<id>/<unit>/<lang>.mp3` | 公開音声と、配信しない `.mp3.json` 生成記録 |
| `scripts/content/` | 検証、外部private初期化、新規下書き作成 |
| `scripts/build/` | パス境界、読込、allowlist構築、実行、公開成果物検査 |
| `scripts/tts/` | TypeScript CLI、Python生成処理、差し替え可能なアダプター |
| `public/` | 予約領域。ここへ入れたファイルは自動配信しない |
| `.generated/public/`, `.generated/local/` | モード別の再生成可能な中間データ（Git管理外） |
| `dist/public/`, `dist/local/` | 分離した静的成果物（Git管理外） |
| `node_modules/.astro-public/`, `.astro-local/` | モード別Astroキャッシュ |
| `.cache/` | mock、画面検証画像など（Git管理外） |
| `_misc/voice_test/` | 既存TTS実験。読み取り・再利用のみ、Git管理外 |
| `d1ssk.github.io` | 既存親サイトの参照用リンク。ビルド入力にしない |

外部の `../language-prism-private/` は `content/`, `media/`, `voices/` を保持します。`.env.local` で別の外部ルートも指定できます。原本は外部に置き、明示的なlocalビルドでのみGit管理外の中間データ・成果物にコピーします。

日英のURLとソース構造、本文の9言語との区別は [I18N.md](I18N.md) を参照してください。

## Webデータフロー

```text
公開JSON ─ 検証 ─ ready選択 ──────┐
                                  ├─ モード別catalog ─ 同一Astro UI ─ dist/<mode>
外部private JSON ─ 検証 ─────────┘  （localだけ、全状態）
               音声の明示的参照 ─ 存在・パス・生成記録の確認 ─ 選択MP3のみ
```

`run.ts` がモードを固定してAstroを起動します。`build` の既定はpublicです。Astro設定の準備処理がカタログを構築し、Astroの `publicDir` を `.generated/<mode>/assets/` に向けます。通常の `public/` からの一括コピーは行いません。

公開処理はprivateルートの解決関数を呼ばず、`.env.local` を読みません。Viteの `envDir` も無効化しています。public用JSONはdraftも含めて検証し、収録はreadyのみです。localは両scopeの全状態を表示します。public/privateで同じスキーマを使い、IDまたはslugの重複は停止します。

音声の対応はJSONに明記された正規形 `type/id/unit/lang.mp3` だけを認めます。存在しない音声は `availableAudio` に載せず、ボタンを無効化します。Chatterbox音声には非mockの生成記録、入力の一致、MP3ハッシュの一致を要求します。生成記録、参照音声、WAV、未参照MP3はコピーしません。

HTMLに使用する文章はAstroのエスケープを通し、本文からHTMLやスクリプトを実行しません。外部出典URLはHTTP(S)に限定します。アプリは外部フォント・計測・APIを自動取得しません。localのページにはnoindexとno-referrerを設定します。

## 公開と非公開の境界

防御は `.gitignore` に加えて以下で構成します。

1. 原本ディレクトリが分離され、privateはリポジトリ内・親ディレクトリとも指定不可。
2. publicの入口からprivateパス解決・読み込みへ到達しない。
3. 読込ルート・JSON・音声の途中にsymlinkがあれば拒否。ID、slug、音声参照も制限。
4. 中間データ、音声stage、出力、キャッシュをモードごとに分離。
5. `privacy:check` は生成ページ・ビルドマーカー・参照MP3・AstroのJS/CSSだけを許可。source mapや余分なファイルは拒否。
6. `npm test` は一意なprivateのタイトル・本文・解説・タグ・slug・音声バイトを一時生成し、localで存在し、publicの全ファイル・パスから消えることを確認。
7. Actionsは公開コマンドと `dist/public` のみを利用。Git管理対象も検査（Git未初期化なら対象なしと表示）。

`privacy:check` 自体はprivateを読みません。固有の非公開文字列による検査は、その文字列を知っているテストが明示的に渡します。privateの内容を手動でpublic側に貼り付けた場合まで機械的に判別するものではありません。公開する本文・権利はpublicへ移す時点で確認します。

`dist/local` は非公開の内容を含むため、ディレクトリごと配布しません。公開前に手で `dist/` 全体をアップロードする運用も避けます。

## 音声処理

```text
CLIのwork/unit/lang/scope
 → 同じZodによるJSON検証
 → ttsTextと固定順序からジョブ作成
 → JSONをstdinでPythonへ（shell展開なし）
 → fingerprint比較
 → MLX / Torch / mock adapter
 → 一時WAV → ffmpeg → MP3の置換
 → 生成記録 → content.jsonの音声参照更新
```

MLXはバッチごとに一度だけモデルを読み込み、`lang_code` を渡します。Torchアダプターは `language_id` を渡します。通常生成ではHF_HUB_OFFLINEとTRANSFORMERS_OFFLINEを有効化し、モデルの初回準備だけ別操作にします。WebビルドからPythonやTTSは呼びません。

生成記録は入力テキスト・ハッシュ・モデル情報を含むので、非公開側では外部media内にのみ保存します。公開側の記録も配信用allowlistには入れません。中間WAVは一時ディレクトリ内で管理し、例外時も削除します。MP3変換が成功するまで既存MP3を置き換えません。

連続再生は各文のMP3をブラウザ内のキューで順に再生します。結合ファイルは保存せず、本文・音声を日英UIでも共有します。将来ダウンロード用の結合MP3が必要になった場合は、任意の書き出しジョブとして追加できます。

## 制約

- JSONの自動監視は未実装。追加・変更後はdev再起動または再ビルド。
- 同じモードの複数ビルド・同じ教材の複数音声生成は同時に走らせないこと。
- 記事一覧と本文は静的生成。検索機能と検索インデックスは廃止。
- 初期化では記事を自動作成しない。現在は公開Practical「ランダム 1」を収録。
