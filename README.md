# English Skills Studio

英語学習用の 5 ページ構成 Web アプリです。GitHub Pages 配信を前提にしています。

- `index.html`: 学習状況の **Dashboard**
- `imitation.html`: 音声ベースの **Imitation Player**
- `slash.html`: テキストベースの **slash-reading**
- `shadowing.html`: 動画ベースの **Shadowing**
- `review.html`: 単語・フレーズの **SRS Review**

## Demo / Pages

GitHub Pages ではリポジトリルートから配信されます。

- `index.html`（または `/`）: Dashboard
- `imitation.html`: Imitation Player
- `slash.html`: slash-reading
- `shadowing.html`: Shadowing
- `review.html`: SRS Review

## Features

- 音声セグメント単位の再生（トラック切替、前後移動、再生速度、リピート）
- トランスクリプト表示と UI 連動
- slash-reading のセット切替とチャンク表示（2-3 文）
- チャンク単位の `Slash` / `JP` トグル
- Shadowing のセット切替と YouTube 練習動画一覧
- Anki風 SRS（`Again / Good / Easy`）で単語・フレーズ復習
- Imitation / Slash で選択した英語表現から SRSカード用モーダルを起動
- Slash では選択語を含む1文を優先して例文プリセット
- Review の `+ New` から単語・フレーズ・例文付きの SRS カードを追加
- ログイン時に復習Due件数をヘッダー表示（アプリ内通知）
- Supabase Auth（Email OTP）によるログイン導線（`auth.html`）
- PWA 対応（`manifest.json` + `sw.js`）
- オフライン時のキャッシュ再生補助（`/audio/` は Cache First）

## Project Structure

| Path | Role |
|---|---|
| `index.html` | Dashboard エントリ |
| `imitation.html` | Imitation Player エントリ |
| `slash.html` | slash-reading エントリ |
| `shadowing.html` | Shadowing エントリ |
| `review.html` | SRS Review エントリ |
| `auth.html` | Supabase Email OTP ログインページ |
| `css/style.css` | English Skills Studio 用スタイル |
| `css/slash.css` | slash-reading 用スタイル |
| `css/shadowing.css` | Shadowing 用スタイル |
| `css/auth.css` | 認証ページ用スタイル |
| `js/app.js` | Dashboard 初期化・イベント配線 |
| `js/imitation-app.js` | Imitation Player 初期化・イベント配線 |
| `js/auth.js` | Supabase クライアント初期化と認証API |
| `js/auth-page.js` | auth.html のイベント処理 |
| `js/auth-ui.js` | topbar のログイン状態表示 |
| `js/mobile-topbar.js` | モバイル用ハンバーガー/ドロワー制御 |
| `js/player.js` | 音声再生ロジック |
| `js/supabase-config.js` | Supabase URL / anon key 設定 |
| `js/ui.js` | DOM 操作・表示更新 |
| `js/state.js` | 共有状態 |
| `js/slash-app.js` | slash-reading 初期化・データ整形 |
| `js/slash-ui.js` | slash-reading 描画・トグル |
| `js/slash-state.js` | slash-reading 状態 |
| `js/shadowing-app.js` | Shadowing 初期化・データ読み込み |
| `js/shadowing-ui.js` | Shadowing 描画・埋め込みトグル |
| `js/shadowing-state.js` | Shadowing 状態 |
| `js/review-app.js` | SRS Review 初期化・イベント配線 |
| `js/srs-api.js` | SRSカード取得 / レビュー保存API |
| `js/srs-quick-add.js` | テキスト選択からSRS下書きカードを追加 |
| `js/srs-scheduler.js` | 忘却曲線ベースの次回復習日時計算 |
| `data/data.json` | トラック/セグメント定義（音声ページ用） |
| `data/slash-data.json` | セット/英文/スラッシュ/和訳（slash 用） |
| `data/shadowing-data.json` | セット/練習動画URL（Shadowing 用） |
| `audio/segments/{key}/{nn}.mp3` | セグメント音声 |
| `scripts/transcribe.py` | 音声分割 + Whisper API 文字起こし + JSON 更新 |
| `scripts/import-shadowing-set.py` | 公開 Notion ページから Shadowing セットを抽出して JSON 更新 |
| `manifest.json` | PWA マニフェスト |
| `sw.js` | Service Worker |
| `docs/srs-supabase.sql` | SRS用Supabaseテーブル定義 |

## Supabase Auth Setup (Email OTP)

1. Supabase プロジェクトを作成
2. Authentication > Providers > Email を有効化（Email OTP）
3. Authentication > URL Configuration で以下を設定
- Site URL: 例 `https://<your-site-domain>/`
- Redirect URLs: 例 `https://<your-site-domain>/auth.html`
4. 自分専用運用にする場合は、Authentication > Users に自分のメールユーザーを作成
5. 本実装では `shouldCreateUser: false` を使っているため、未登録メールはログイン不可
6. `js/supabase-config.js` を編集

```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJ...';
```

7. `auth.html` を開いて認証コード送信とログインを確認

## SRS Tables Setup (Supabase)

SRS Review を使うには `docs/srs-supabase.sql` を SQL Editor で実行してください。

作成される主なテーブル:

- `srs_cards`（単語・フレーズのカード本体）
- `srs_card_states`（復習状態: due / stability / difficulty など）
- `srs_review_logs`（レビュー履歴）

`srs_cards` には下書き運用のため `status`（`draft|ready`）と `normalized_term`（重複判定用）を持たせます。  
`draft` は `is_active=false` で保存され、`ready` になったカードのみ復習対象として有効化します。  
`+ New` や選択導線で `term_en / term_ja / example_en / example_ja` が揃っていれば、その場で `ready` 保存されます。

## Draft Enrichment (Local)

下書きカードの補完はローカル運用（Codex等）を想定しています。  
`scripts/enrich-srs-drafts.py` を使って下書き一覧取得と ready 化更新を行えます。

補完方針:
- 既に入っている `example_en` / `example_ja` は原則維持
- 欠けている項目だけを補完
- `example_en` は元の `term_en` を含む必要あり

```bash
# 下書き一覧
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
uv run python3 scripts/enrich-srs-drafts.py --list

# 補完JSONを適用（dry run）
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
uv run python3 scripts/enrich-srs-drafts.py --input enrichments.json --dry-run

# 実適用
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
uv run python3 scripts/enrich-srs-drafts.py --input enrichments.json
```

### Daily Batch (Recommended)

日次バッチは `scripts/run-srs-draft-batch.sh` を **2段階** で実行します（list -> Codex補完 -> apply）。

```bash
# Step 1: draft一覧を取得（Codexに渡す）
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
bash scripts/run-srs-draft-batch.sh --prepare

# Step 2: Codexが作った enrichments.json を検証（DB反映なし）
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
bash scripts/run-srs-draft-batch.sh --input /path/to/enrichments.json --dry-run

# Step 3: 本反映
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
bash scripts/run-srs-draft-batch.sh --input /path/to/enrichments.json
```

Codex自動補完まで含めて一括実行する場合:

```bash
# 一括 dry-run（DB反映なし）
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
bash scripts/run-srs-draft-batch.sh --codex-auto --dry-run

# 一括本反映
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
bash scripts/run-srs-draft-batch.sh --codex-auto
```

補完JSONは Codex が作成する前提ですが、必要ならローカルLLM生成スクリプトも使えます:

```bash
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1 \
LOCAL_LLM_API_KEY=local \
LOCAL_LLM_MODEL=gpt-4.1-mini \
uv run python3 scripts/generate-srs-enrichments.py \
  --in /tmp/drafts.json \
  --out /tmp/enrichments.json \
  --errors-out /tmp/batch-errors.json
```

`cron` 例（毎日 03:00 JST）:

```cron
# 例: 03:00にdraftsをエクスポート（補完はCodex運用）
0 3 * * * cd /path/to/english-skills-studio && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bash scripts/run-srs-draft-batch.sh --prepare >> /tmp/srs-draft-batch.log 2>&1
```

## Local Development

`fetch('data/data.json')` を使うため、`file://` では動きません。ローカルサーバーを起動してください。

```bash
uv run python3 -m http.server 8080
```

アクセス先:

- `http://localhost:8080/index.html`
- `http://localhost:8080/imitation.html`
- `http://localhost:8080/slash.html`
- `http://localhost:8080/shadowing.html`

## Add a Shadowing Set

新しい公開 Notion ページから Shadowing セットを追加する場合は、以下を実行します。

```bash
uv run python3 scripts/import-shadowing-set.py \
  --url "https://<your-page>.notion.site/<page-id>"
```

事前確認だけしたい場合:

```bash
uv run python3 scripts/import-shadowing-set.py \
  --url "https://<your-page>.notion.site/<page-id>" \
  --dry-run
```

成功すると `data/shadowing-data.json` が source URL ベースで upsert されます。  
このスクリプトは各セクションの `YouTubeはこちら` に含まれる YouTube 動画だけを抽出し、Vimeo 埋め込みや補助リンクは無視します。

## Data Schema

### `data/data.json`（音声ページ）

```json
[
  {
    "label": "Track Label",
    "key": "track-key",
    "segments": [
      { "transcript": "..." }
    ]
  }
]
```

### `data/slash-data.json`（slash-reading）

```json
{
  "sets": [
    {
      "id": "shadowing-mid-adv",
      "label": "シャドーイング（中上級）",
      "entries": [
        {
          "id": "sr-001",
          "title": "SNSの使用時間",
          "en": "English script...",
          "slash": "English script / with slashes...",
          "ja": "日本語訳...",
          "chunks": [
            {
              "en": "Chunked English text...",
              "slash": "Chunked English / with slashes...",
              "ja": "チャンク対応の日本語訳..."
            }
          ]
        }
      ]
    }
  ]
}
```

`chunks` がある場合は表示時にそれを優先して使います。未定義の場合のみフォールバックとして自動分割します。

### `data/shadowing-data.json`（Shadowing）

```json
{
  "sets": [
    {
      "id": "shadowing-beginner-2",
      "label": "シャドーイング（初級2）",
      "entries": [
        {
          "id": "sh-001",
          "title": "ニューヨーク旅行",
          "wpm": 177,
          "youtubeUrl": "https://youtu.be/9RVnNzYhnl4"
        }
      ]
    }
  ]
}
```

## Add a New Audio Track

1. 元音声ファイルを `audio/` に配置
2. `scripts/transcribe.py` の `FILES` に `("audio/ファイル名", key, label)` を追加
3. 実行:

```bash
OPENAI_API_KEY=sk-... uv run python3 scripts/transcribe.py
```

4. 生成物を確認
- `audio/segments/{key}/` にセグメント MP3
- `data/data.json` が upsert 更新（同じ `key` は上書き）
- `transcripts.json` バックアップ（`.gitignore` 対象）

## Add a New Slash Set

1. `data/slash-data.json` の `sets` に要素を追加
2. 各 `entries[]` に `id`, `title`, `en`, `slash`, `ja` を記述
3. `http://localhost:8080/slash.html` で表示確認

4. チャンク整合チェック（任意）

```bash
node scripts/validate-slash-chunks.js
```

## Development Task Management

開発タスクはリポジトリ直下の `TASKS.md` で管理します。  
運用方針は「思いついたら即メモし、着手時にIssue化」です。

1. 思いつきタスクを `Inbox` に追記（`issue:none`）
2. 着手時に GitHub Issue を作成し、`issue:#<番号>` に更新して `Now` へ移動
3. 完了時に `Done` へ移動し、`done:YYYY-MM-DD` を追記

タスクフォーマット（1行）:

```md
- [ ] T-YYYYMMDD-XXX | タイトル | p1|p2|p3 | owner:@<github-id>|me | issue:#123|none | created:YYYY-MM-DD
- [x] T-YYYYMMDD-XXX | タイトル | p1|p2|p3 | owner:@<github-id>|me | issue:#123|none | created:YYYY-MM-DD | done:YYYY-MM-DD
```

補足:
- `Now` の同時進行は 5 件まで（WIP 制限）
- `scripts/check-tasks.sh` で形式チェック可能
- CI でも `TASKS.md` の妥当性を検証

## Notes

- GitHub Pages の都合上、Git LFS は使っていません
- 音声ファイルは通常の Git オブジェクトとして管理しています
