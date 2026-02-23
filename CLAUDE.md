# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

英語学習用の3ページ構成Webアプリ（GitHub Pages配信）。

- `index.html`: 音声ベースの English Skills Studio
- `slash.html`: テキストベースの slash-reading
- `shadowing.html`: 動画ベースの Shadowing
- `auth.html`: Supabase Email OTP 認証ページ

## アーキテクチャ

### ファイル構成と役割

| ファイル | 役割 |
|---|---|
| `index.html` | English Skills Studio のエントリページ |
| `slash.html` | slash-reading のエントリページ |
| `shadowing.html` | Shadowing のエントリページ |
| `auth.html` | Supabase Email OTP の認証ページ |
| `css/style.css` | English Skills Studio のスタイル |
| `css/slash.css` | slash-reading のスタイル |
| `css/shadowing.css` | Shadowing のスタイル |
| `css/auth.css` | 認証ページのスタイル |
| `js/state.js` | 共有ミュータブル状態オブジェクト |
| `js/player.js` | 音声再生ロジック |
| `js/ui.js` | DOM 操作・レイアウト |
| `js/app.js` | English Skills Studio のエントリーポイント（初期化・イベント配線） |
| `js/auth.js` | Supabase クライアント初期化と認証API |
| `js/auth-page.js` | auth.html のイベント処理 |
| `js/auth-ui.js` | topbar のログイン状態表示 |
| `js/mobile-topbar.js` | モバイル用ハンバーガー/ドロワー制御 |
| `js/slash-state.js` | slash-reading の状態オブジェクト |
| `js/slash-ui.js` | slash-reading の描画・トグル・セット切替 |
| `js/slash-app.js` | slash-reading の初期化・データ整形 |
| `js/shadowing-state.js` | Shadowing の状態オブジェクト |
| `js/shadowing-ui.js` | Shadowing の描画・埋め込みトグル |
| `js/shadowing-app.js` | Shadowing の初期化・データ整形 |
| `data/data.json` | 各セグメントのトランスクリプトとトラック情報 |
| `data/slash-data.json` | slash-reading のセット・英文・スラッシュ・和訳データ |
| `data/shadowing-data.json` | Shadowing のセット・YouTube URL データ |
| `audio/segments/{key}/{nn}.mp3` | セグメント単位の音声ファイル（`adj`/`future`/`past`） |
| `audio/*.mp3,*.m4a` | 元の録音ファイル（文字起こし用） |
| `scripts/transcribe.py` | 元音声 → セグメント分割 + Whisper API 文字起こし + MP3 書き出し |
| `manifest.json` | PWA設定（ショートカット含む） |
| `sw.js` | Service Worker（3ページ + auth + データ + 音声キャッシュ） |

### データフロー

```
audio/*.mp3,*.m4a
    ↓ scripts/transcribe.py (OpenAI Whisper API)
data/data.json + audio/segments/{key}/{nn}.mp3
    ↓ fetch() on page load
index.html → js/app.js → js/player.js / js/ui.js

data/slash-data.json
    ↓ fetch() on page load
slash.html → js/slash-app.js → js/slash-ui.js / js/slash-state.js

data/shadowing-data.json
    ↓ fetch() on page load
shadowing.html → js/shadowing-app.js → js/shadowing-ui.js / js/shadowing-state.js
```

### JS モジュール構成

循環依存（player ↔ ui）を **init コールバック** パターンで解決：

```js
// app.js（起動時に配線）
player.init({ setWave: ui.setWave, updateUI: ui.updateUI });
ui.init({ loadAndPlay: player.loadAndPlay });
```

| モジュール | エクスポート |
|---|---|
| `state.js` | `state` オブジェクト（DATA, current, audio, trackIdx, repeat, speed, playing, revealedState） |
| `player.js` | `init`, `loadAndPlay`, `togglePlay`, `prev`, `next`, `toggleRepeat`, `setSpeed` |
| `ui.js` | `init`, `applyMobileLayout`, `buildSentenceList`, `toggleReveal`, `updateUI`, `setWave`, `selectTrack` |
| `app.js` | 副作用のみ（イベント配線・データ読み込み） |
| `slash-state.js` | `state` オブジェクト（sets, currentSetIdx, entries, entryOpen, slashVisible, jaVisible） |
| `slash-ui.js` | `selectSet`, `renderSetList`, `renderList` |
| `slash-app.js` | 副作用のみ（データ読み込み・セット正規化・チャンク分割） |
| `shadowing-state.js` | `state` オブジェクト（sets, currentSetIdx, entries, openMap） |
| `shadowing-ui.js` | `selectSet` |
| `shadowing-app.js` | 副作用のみ（データ読み込み・セット正規化） |

### ページ別UI方針

- 3ページとも `topbar + sidebar + main` の共通トーン
- ページ間はヘッダーのリンクで相互遷移（`index.html` / `slash.html` / `shadowing.html`）
- English Skills Studio のジャケット背景は非表示（トーンをslash側に統一）
- slash-reading はエントリを2-3文チャンクで表示し、チャンク単位で `Slash` / `JP` トグル
- slash-reading はセット単位のサイドバー切替を持つ
- Shadowing はYouTube練習動画をカード表示し、埋め込み開閉を持つ
- モバイル（<=640px）はハンバーガー + 右ドロワーでナビ/ログアウトを表示

## ローカルでの動作確認

`fetch('data/data.json')` を使用しているため `file://` では動作しない。ローカルサーバーを起動すること：

```bash
uv run python3 -m http.server 8080
```

http://localhost:8080 をブラウザで開く。終了は `Ctrl+C`。

確認時のURL:
- English Skills Studio: `http://localhost:8080/index.html`（またはルート）
- slash-reading: `http://localhost:8080/slash.html`
- Shadowing: `http://localhost:8080/shadowing.html`
- Auth: `http://localhost:8080/auth.html`

## data.json の役割とベストプラクティス

`data/data.json` はアプリ起動時に `fetch('data/data.json')` で取得する **コンテンツ定義ファイル**。
スキーマ: `[{ label, key, segments: [{ transcript }] }]`

**fetch vs HTML 埋め込みのベストプラクティス**:
→ **fetch が正解（現在の実装が正しい）**。理由：
- コンテンツ（音声・テキスト）とプレゼンテーション（HTML/JS）を分離できる
- 音声を追加するたびに HTML を変更しなくて済む
- GitHub Pages はそのまま JSON を配信できる

## slash-data.json の役割とスキーマ

`data/slash-data.json` は slash-reading 専用のコンテンツ定義。

現在の推奨スキーマ:

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
          "slash": "English script with slashes...",
          "ja": "日本語訳..."
        }
      ]
    }
  ]
}
```

補足:
- `js/slash-app.js` は旧形式（配列直下）も後方互換で読み込める
- 表示時に `en/slash/ja` を2-3文単位チャンクへ自動分割
- 将来のセット追加は `sets[]` に要素追加で対応

## 新しいトラックを追加する手順

1. 元音声ファイルを `audio/` に配置
2. `scripts/transcribe.py` の `FILES` リストにエントリ追加（`("audio/ファイル名", key, label)`）
3. `OPENAI_API_KEY=sk-... uv run python3 scripts/transcribe.py` を実行
   - `audio/segments/{key}/` にセグメントMP3 が自動生成される
   - `data/data.json` が自動的に upsert される（key が一致するトラックは上書き、新規は末尾追加）
   - `transcripts.json` にバックアップが保存される（`.gitignore` 対象）
4. `git add` してコミット

## 新しい slash-reading セットを追加する手順

1. `data/slash-data.json` の `sets` に新しいセットを追加
   - 必須: `id`, `label`, `entries`
2. 各 `entries[]` に `id`, `title`, `en`, `slash`, `ja` を記載
3. `http://localhost:8080/slash.html` でセット切替とチャンク表示を確認
4. 必要なら `slash` の区切りを中級レベル（意味ブロック中心）に調整

## GitHub Pages

リポジトリのルートから配信。`index.html` / `slash.html` / `shadowing.html` / `auth.html` を提供。

PWAの要点:
- `manifest.json` の `start_url` は `./index.html`
- `shortcuts` に English Skills Studio / Slash Reading / Shadowing の3導線を定義
- `sw.js` で3ページ + auth・各CSS/JS・`data/data.json`・`data/slash-data.json`・`data/shadowing-data.json` をキャッシュ
- 音声（`/audio/`）は Cache First でオフライン再生を補助

Git LFS は使用していない（GitHub PagesがLFSファイルを配信できないため）。音声ファイルは通常のgitオブジェクトとして管理。
