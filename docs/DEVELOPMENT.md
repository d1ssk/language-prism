# language prism 開発ガイド

プロジェクトの概要は [README](../README.md) を参照してください。

世界の文章を、異なる言語で読み、聞き、比べる個人用アーカイブ。日常の場面や短いやり取りを扱う **Practical**、文法・構文別の例文を扱う **Grammar**、文学・思想・科学などを扱う **Library** を同じ形式で蓄積します。

日本語 → 英語 → スペイン語 → フランス語 → ドイツ語 → ロシア語 → アラビア語 → 中国語 → 韓国語。この基準順序は `config/languages.json` で管理します。英語版の表示・連続再生では英語→日本語を先頭にし、残り7言語は同じ順序です。

Astro + TypeScript + Zod の静的サイトです。閲覧時にAPI、DB、TTSサービスは不要です。スタイルは親サイト `d1ssk.github.io` の配色・書体・罫線に合わせています。親サイトと `_misc/voice_test` の既存ファイルは変更していません。

画面は日本語・英語に対応しています。ホーム・一覧・記事は `/ja/` と `/en/` で分け、テンプレート・記事データ・MP3は共有します。構造と今後の記事形式への方針は [I18N.md](I18N.md) にまとめています。

## 初回セットアップ

Node 24推奨、npm 10以降。`npm install` はプロジェクト専用Node 24も導入するため、既存のシステムNodeを変更せずnpmスクリプトを実行できます（古いNodeからのインストール時にengine警告が出る場合があります）。ロックファイルに依存関係を固定しています。

```bash
npm ci
npm run init:local
npm run dev:local
```

ブラウザで **http://127.0.0.1:4342/ja/**（日本語）または **http://127.0.0.1:4342/en/**（English）を開きます。`/` は日本語版へ移動します。ホームからPractical / Grammar / Libraryの各一覧へ移動できます。開発サーバーはターミナルでCtrl+Cを押すと停止します。

教材の形式と日英解説の編集基準は [CONTENT_FORMAT.md](CONTENT_FORMAT.md)、本文・読みの校閲候補は [CONTENT_REVIEW.md](CONTENT_REVIEW.md) を参照してください。Libraryの原典と抜粋範囲は [LIBRARY_SOURCES.md](LIBRARY_SOURCES.md)、挨拶の対応表現に関する出典と編集判断は [GREETINGS_SOURCES.md](GREETINGS_SOURCES.md) にまとめています。

`init:local` は隣接する `../language-prism-private/` に `content/`, `media/`, `voices/` を作ります。記事は自動作成しません。既存ファイルは上書きしません。別の場所を使う場合は先に `.env.example` を `.env.local` にコピーし、`PRISM_PRIVATE_ROOT` を編集してください。リポジトリ内・その親ディレクトリを非公開ルートに指定するとエラーになります。

公開版だけなら `npm run init:local` は不要です。

```bash
npm run dev:public          # http://127.0.0.1:4341/
npm run build              # 常に公開版 → dist/public/
npm run build:public       # 公開版。readyだけを収録
npm run build:local        # 公開 + 非公開、draft/reviewも収録 → dist/local/
npm run preview:public     # ビルド済み公開版 :4341
npm run preview:local      # ビルド済みローカル版 :4342
```

全サーバーのバインド先は `127.0.0.1` です。各コマンドにホスト・出力先の上書き引数は受け付けません。プレビューは対応するビルドの後に実行します。本文JSONや音声を追加・編集したときは開発サーバーを再起動してください（UIのAstro/CSSは通常の自動更新に対応）。

## 閲覧できる機能

- 制作方針を記したホームと、Practical / Grammar / Libraryの個別一覧（検索機能なし）
- ホームから開ける日英の「表記・学習ガイド」（読み表記の共通ルール・参考資料・音声の使い方）
- 9言語を表示言語に合わせた順で表示、アラビア語RTL
- 各文の左側の開閉記号を押すと単語・語法・文法の解説（日英）
- アラビア語はラテン文字転写、中国語は声調付き拼音を解説の冒頭に表示
- 個別・意味単位の9言語・記事全体の再生、速度、文間ポーズ、停止
- 実在する音声だけが再生可能。欠けた音声は連続再生時にスキップ
- 原文の出典・権利と、翻訳方法・校閲状況・音声品質を分けて表示
- JavaScript無効時も本文・解説・個別音声を利用可能

本文・読み・日英の解説は記事ごとのJSON、音声は文ごとのMP3に保存します。連続再生は同じMP3を順に使い、結合版を重複保存しません。日本語・英語の両UIも同じ本文と音声を共有します。保存形式と編集手順は [CONTENT_FORMAT.md](CONTENT_FORMAT.md) にまとめています。

## 最初の教材を追加する

非公開を既定とした下書きを作れます。

```bash
npm run content:new -- --id my-first-work --type library --scope private
```

1. `../language-prism-private/content/library/my-first-work/content.json` を編集します。
2. `units` の各意味単位に9言語の本文・読み・解説を追加します。フィールドは [CONTENT_FORMAT.md](CONTENT_FORMAT.md) を参照してください。
3. 日本語 `text` は漢字かな交じり、`ttsText` は手動確認したひらがなにします。
4. `npm run validate:content -- --local` で確認し、`npm run dev:local` で閲覧します。未完成の言語がある間は `draft` のままで保存できます。

公開用教材は `--scope public` で `content/public/` に作り、権利・内容を確認して `publicationStatus: "ready"` にします。公開には各言語の本文・必須読みが必要です。同じ使い方の定型表現を載せない言語は、`noEquivalent` に理由を明示します。単なる未記入は検証に失敗します。`ready` は構造的な公開準備の状態であり、翻訳の校閲済みを意味しません。

非公開教材を公開する自動昇格機能はありません。本文JSONと必要なMP3・生成記録を明示的にpublic側へ複製し、検証する必要があります。UI本体の変更は不要です。

詳細は [CONTENT_FORMAT.md](CONTENT_FORMAT.md) を参照してください。

## 連続再生とバックグラウンド再生

文間「なし」の複数音声の再生では、対応ブラウザでMedia Source Extensionsを使い、既存のMP3を単一のストリームとして順に読み込みます。文ごとの `ended` → `play()` をなくし、約90秒先まで先読みします。再生済み部分は約30秒を残して解放し、戻るシークでは必要なMP3を再取得します。記事全体・途中から末尾・意味単位ごとの再生に共通です。MP3の結合ファイルや新しい音声は生成しません。

文間の既定値は「なし」です。間隔を指定した場合やMSEのMP3再生に対応しないブラウザでは、従来の文ごとの再生を使います。間隔の変更は次の再生開始時に反映します。Androidの画面ロック中の動作は実機で確認する必要があり、PCのブラウザテストだけでは保証できません。

## ChatterboxとMP3生成

以下の生成例は、`my-first-work` に本文・読みを登録した後に実行します。

既存の `_misc/voice_test/.venv` にある **mlx-audio 0.6.1 / Chatterbox Multilingual V3** を優先します。モデルキャッシュと参照音声も既存のものを再利用します。新しいCLIは旧テストスクリプトを実行・変更せず、同じライブラリAPIを呼びます。

```bash
# 生成計画だけ確認（モデル不要、ファイルの変更なし）
npm run tts -- --scope private --work my-first-work --dry-run

# 登録した記事の日本語1文だけ生成
npm run tts -- --scope private --work my-first-work --unit u001 --lang ja

# 英語とフランス語を全unit分生成
npm run tts -- --scope private --work my-first-work --lang en,fr

# 非公開記事。--scope の既定は private
npm run tts -- --scope private --work my-first-work --unit u001 --lang ja

# 強制再生成
npm run tts -- --scope private --work my-first-work --unit u001 --lang ja --force
```

`--unit` / `--lang` を省略すると、用意されている全意味単位・全言語を固定順で処理します。日本語は必ず `ttsText` を使います。他言語は `ttsText` があれば優先し、draftで未記入の場合だけ `text` にフォールバックします。日本語の漢字・カタカナ・数字混入はエラーです。

保存先は `media/public/<type>/<id>/<unit>/<lang>.mp3`、非公開は外部ルートの `media/<type>/<id>/<unit>/<lang>.mp3` です。成功時に `content.json` の音声参照を追加し、`qualityStatus` を `unreviewed` にします。各MP3に `.mp3.json` の生成記録を添えます。WebビルドはMP3だけをコピーし、この生成記録は配信しません。

入力、言語、モデル／トークナイザのsnapshot・ファイル情報、バックエンドバージョン、生成パラメータ、参照音声のSHA-256、アダプターコードが同じならスキップします。MP3の改変もSHA-256で検出します。変更がある場合は再生成します。途中で失敗しても、生成済み音声や変換前の既存MP3を維持し、残りのジョブを処理して終了コード1を返します。

通常の生成は**オフライン固定**です。初回だけ、既存環境のセットアップ・ダウンロードを実行します。

```bash
cd _misc/voice_test
./setup.sh          # 既存環境がない場合だけ
./run.sh --download # モデル・S3Tokenizer・参照音声を取得
cd ../..
```

旧環境を持たない別のMacでは、Python 3.12の専用環境に以下を導入します。Torch版は任意の別環境に導入し、既存MLX環境へ混在させないでください。

```bash
python3.12 -m venv .venv-tts
.venv-tts/bin/pip install mlx-audio==0.6.1 imageio-ffmpeg==0.6.0 soundfile==0.13.1
# .env.local の PRISM_TTS_PYTHON を .venv-tts/bin/python に設定
```

初回モデル取得例（指定したHF_HOMEと `.env.local` の `PRISM_TTS_HF_HOME` を一致させます）：

```bash
HF_HOME=../language-prism-private/model-cache .venv-tts/bin/python - <<'PY'
from huggingface_hub import snapshot_download
patterns = ['*.safetensors', '*.json', '*.txt', '*.jinja', '*.model']
for model in ['mlx-community/chatterbox-multilingual-v3', 'mlx-community/S3TokenizerV2']:
    snapshot_download(model, allow_patterns=patterns)
PY
```

雑音・BGMのない単独話者の短い参照WAVを、利用権限を確認して外部 `voices/` に置き、`PRISM_TTS_REFERENCE` または `--ref` で指定します。参照音声自体はサイトに含めません。既存デモ参照音声を再利用する場合も、生成物の公開前に用途と品質を確認してください。

任意のオプション：`--backend mlx|torch|mock`, `--model`, `--model-revision`, `--ref`, `--seed`, `--max-tokens`, `--temperature`。`--max-tokens` はMLX版の上限で、Torch版では適用しません。Torchアダプターは実装済みですが実機未検証です。

ffmpegは既存venvの `imageio-ffmpeg` 同梱版を優先します。Homebrew版を修正する必要はありません。別実行ファイルは `.env.local` の `PRISM_FFMPEG` で指定できます。WAVは一時ディレクトリで作り、MP3変換後に削除します。

```bash
# モデルなしのテスト音。配信用mediaやcontent.jsonには書き込みません
npm run tts -- --scope private --work my-first-work --unit u001 --lang en --backend mock
```

mockの出力は `.cache/tts-mock/` に隔離します。mock生成記録の付いた音声は、public/privateいずれのビルドでも拒否します。

日本語の読みの候補を出す補助スクリプトもあります（任意依存 `pykakasi`）。既存の `ttsText` は上書きしません。

```bash
.venv-tts/bin/pip install pykakasi
.venv-tts/bin/python scripts/tts/hiragana.py '山路を登りながら、こう考えた。'
```

## 検証

以下は開発全般のコマンド一覧です。`npm test` はpublic/localの作業領域を更新するため、単独のビルドやブラウザ検証と並行実行せず、順に実行してください。

```bash
npm run check
npm run validate:content
npm run validate:content -- --local
npm test
npm run build:public
npm run build:local
npm run privacy:check
npm run test:browser
```

`npm test` はPython 3とNodeで動作し、TTSモデルをロードしません。実際に一時的な外部privateデータを作り、public/local両ビルドを比較します。テスト用local出力を削除するため、終了後に `build:local` を実行してください。

ブラウザ検証はMacの既存Chromeを使います。他の環境では `npx playwright install chromium`、または `PRISM_BROWSER_EXECUTABLE` を指定してください。検証中だけ127.0.0.1に一時サーバーを起動し、最後に停止します。画像は `.cache/screenshots/` に保存されます。localのビルドがない場合、localのブラウザ検証は省略します。

公開・非公開の分離構造は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

## 解説の確認台帳

`docs/explanation-progress.json` は既存の本文・構成と確認済み解説の整合性確認に使います。完了済みの作業ログではなく、`scripts/content/explanation-progress.ts` が参照する検査データなので保持します。確認状態の意味と編集基準は [CONTENT_FORMAT.md](CONTENT_FORMAT.md#日本語・英語の解説) を参照してください。

```bash
# 状態と保持対象の確認
node --import tsx scripts/content/explanation-progress.ts status
# 実際に内容を確認した項目だけをまとめて記録（キーは例）
node --import tsx scripts/content/explanation-progress.ts mark checked random-1/u001/ja random-1/u001/en
# 全体の整合性と未確認項目がないことを確認
node --import tsx scripts/content/explanation-progress.ts verify --complete
```

`mark` 自体が保持対象・構造を検査するため、毎回その前後で `status`・`verify` を重ねる必要はありません。確認済み解説を全件再読せず、変更箇所と検出した問題を確認します。本文・TTS入力・読み本体・音声参照等を変更すると保持検査が検出するため、変更の意図と範囲を確認し、基準を無条件に作り直さないでください。

## GitHub Pages

GitHub Actionsのワークフローは [pages.yml](../.github/workflows/pages.yml) にあります。

公開時はリポジトリのSettings → PagesでSourceを **GitHub Actions** に指定します。`main`へのpush、またはActions画面で `main` を選んだ手動実行で、公開ビルド・検証後の **`dist/public/` だけ**をアップロードします。他のブランチでは実行をスキップします。非公開ルートはCIに不要です。コード・公開教材だけをGit管理し、`.env.local`、`_misc/`、参照音声、`dist/`、`.generated/` は含めないでください。

`d1ssk/language-prism` の標準の公開先は `https://d1ssk.github.io/language-prism/` です。日本語版は `/language-prism/ja/`、英語版は `/language-prism/en/` に配置されます。このワークフローは既存の `d1ssk.github.io` リポジトリを変更しません。

サブパスの例：

```bash
PRISM_BASE=/language-prism/ npm run build:public
PRISM_BASE=/language-prism/ npm run preview:public
# http://127.0.0.1:4341/language-prism/
```

Actionsでは `actions/configure-pages` が返す `base_path` に末尾の `/` を加えて `PRISM_BASE` に、`origin` を `PRISM_SITE` に設定します。標準のプロジェクトサイトでは `/language-prism/`、ユーザーサイトや独自ドメインのルートでは `/` になります。公開ビルドでは `.env.local` を読みません。ローカルで公開先を再現するときは、上記のようにシェル環境変数を指定します。

検証とビルドのジョブにはコードとPages設定の読み取り権限だけを与え、Pagesへの書き込みとOIDCの権限はデプロイ専用ジョブに限定しています。実行が重なった場合、進行中の公開をキャンセルせず次の実行を待機させます。追加のPATやTTS環境の設定は不要です。

## トラブルシューティングと今後

- **ローカルが起動しない**：`npm run init:local` と `.env.local` の外部ルートを確認します。
- **公開版に教材が出ない**：public側の `publicationStatus` が `ready` か確認します。音声未生成でも公開できます。
- **MP3があるのにビルドエラー**：`audio.path`、生成記録、`ttsText`、MP3のハッシュを確認し、変更後はCLIを再実行します。手動収録音声は `origin: "human"` を使います。
- **音声ボタンが無効**：その文のファイルが未生成です。生成後に再ビルド／開発サーバー再起動が必要です。
- **モデルが見つからない**：HF_HOMEの場所を合わせ、初回ダウンロードを済ませます。`--dry-run` はダウンロード済みかの検査はしません。
- **No Metal device available**：GPUが使える通常のMacターミナルから実行します。
- **ffmpegのdylibエラー**：`imageio-ffmpeg` を含む既存venvを指定します。
- **長文が途切れる**：意味単位を短くし、必要なら `--max-tokens 2048` を指定します。
- **アドレス使用中**：既存サーバーを維持する場合は `PRISM_PORT=4343 npm run dev:local` のようにポートを変更します。

今後の拡張：ダウンロード用の結合音声の任意書き出し、編集GUI、校閲ワークフロー、再生位置の保存。大量の文学作品・9言語全音声の収録はまだ行っていません。

参考：[Astro設定](https://docs.astro.build/en/reference/configuration-reference/)、[Chatterbox](https://github.com/resemble-ai/chatterbox)、[MLX V3モデル](https://huggingface.co/mlx-community/chatterbox-multilingual-v3)。
