# English Skills Studio

英語学習用の 2 ページ構成 Web アプリです。GitHub Pages 配信を前提にしています。

- `index.html`: 音声ベースの **English Skills Studio**
- `slash.html`: テキストベースの **slash-reading**

## Demo / Pages

GitHub Pages ではリポジトリルートから配信されます。

- `index.html`（または `/`）: English Skills Studio
- `slash.html`: slash-reading

## Features

- 音声セグメント単位の再生（トラック切替、前後移動、再生速度、リピート）
- トランスクリプト表示と UI 連動
- slash-reading のセット切替とチャンク表示（2-3 文）
- チャンク単位の `Slash` / `JP` トグル
- PWA 対応（`manifest.json` + `sw.js`）
- オフライン時のキャッシュ再生補助（`/audio/` は Cache First）

## Project Structure

| Path | Role |
|---|---|
| `index.html` | English Skills Studio エントリ |
| `slash.html` | slash-reading エントリ |
| `css/style.css` | English Skills Studio 用スタイル |
| `css/slash.css` | slash-reading 用スタイル |
| `js/app.js` | English Skills Studio 初期化・イベント配線 |
| `js/player.js` | 音声再生ロジック |
| `js/ui.js` | DOM 操作・表示更新 |
| `js/state.js` | 共有状態 |
| `js/slash-app.js` | slash-reading 初期化・データ整形 |
| `js/slash-ui.js` | slash-reading 描画・トグル |
| `js/slash-state.js` | slash-reading 状態 |
| `data/data.json` | トラック/セグメント定義（音声ページ用） |
| `data/slash-data.json` | セット/英文/スラッシュ/和訳（slash 用） |
| `audio/segments/{key}/{nn}.mp3` | セグメント音声 |
| `scripts/transcribe.py` | 音声分割 + Whisper API 文字起こし + JSON 更新 |
| `manifest.json` | PWA マニフェスト |
| `sw.js` | Service Worker |

## Local Development

`fetch('data/data.json')` を使うため、`file://` では動きません。ローカルサーバーを起動してください。

```bash
uv run python3 -m http.server 8080
```

アクセス先:

- `http://localhost:8080/index.html`
- `http://localhost:8080/slash.html`

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
          "ja": "日本語訳..."
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

## Notes

- GitHub Pages の都合上、Git LFS は使っていません
- 音声ファイルは通常の Git オブジェクトとして管理しています

