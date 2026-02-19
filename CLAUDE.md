# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

英語イミテーション練習用のWebアプリ。短文音声を1文ずつ再生し、シャドーイング・イミテーション練習を行う。GitHub Pagesでホスティング。

## アーキテクチャ

### ファイル構成と役割

| ファイル | 役割 |
|---|---|
| `index.html` | HTML 構造のみ（`<link>` + `<script type="module">`） |
| `css/style.css` | 全スタイル（CSS変数でテーマ管理） |
| `js/state.js` | 共有ミュータブル状態オブジェクト |
| `js/player.js` | 音声再生ロジック |
| `js/ui.js` | DOM 操作・レイアウト |
| `js/app.js` | エントリーポイント（初期化・イベント配線） |
| `data.json` | 各セグメントのトランスクリプトとトラック情報 |
| `audio/segments/{key}/{nn}.mp3` | セグメント単位の音声ファイル（`adj`/`future`/`past`） |
| `audio/*.mp3,*.m4a` | 元の録音ファイル（文字起こし用） |
| `scripts/transcribe.py` | 元音声 → セグメント分割 + Whisper API 文字起こし + MP3 書き出し |

### データフロー

```
audio/*.mp3,*.m4a
    ↓ scripts/transcribe.py (OpenAI Whisper API)
data.json + audio/segments/{key}/{nn}.mp3
    ↓ fetch() on page load
index.html → js/app.js → js/player.js / js/ui.js
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

## ローカルでの動作確認

`fetch('data.json')` を使用しているため `file://` では動作しない。ローカルサーバーを起動すること：

```bash
uv run python -m http.server 8080
```

http://localhost:8080 をブラウザで開く。終了は `Ctrl+C`。

## data.json の役割とベストプラクティス

`data.json` はアプリ起動時に `fetch('data.json')` で取得する **コンテンツ定義ファイル**。
スキーマ: `[{ label, key, segments: [{ transcript }] }]`

**fetch vs HTML 埋め込みのベストプラクティス**:
→ **fetch が正解（現在の実装が正しい）**。理由：
- コンテンツ（音声・テキスト）とプレゼンテーション（HTML/JS）を分離できる
- 音声を追加するたびに HTML を変更しなくて済む
- GitHub Pages はそのまま JSON を配信できる

## 新しいトラックを追加する手順

1. 元音声ファイルを `audio/` に配置
2. `scripts/transcribe.py` の `FILES` リストにエントリ追加（`("audio/ファイル名", key, label)`）
3. `OPENAI_API_KEY=sk-... uv run python scripts/transcribe.py` を実行
   - `audio/segments/{key}/` にセグメントMP3 が自動生成される
   - `data.json` が自動的に upsert される（key が一致するトラックは上書き、新規は末尾追加）
   - `transcripts.json` にバックアップが保存される（`.gitignore` 対象）
4. `git add` してコミット

## GitHub Pages

リポジトリのルートから配信。`index.html` がエントリポイント。

Git LFS は使用していない（GitHub PagesがLFSファイルを配信できないため）。音声ファイルは通常のgitオブジェクトとして管理。
