# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

英語イミテーション練習用のWebアプリ。短文音声を1文ずつ再生し、シャドーイング・イミテーション練習を行う。GitHub Pagesでホスティング。

## アーキテクチャ

### ファイル構成と役割

| ファイル | 役割 |
|---|---|
| `index.html` | UIと再生ロジックをすべて含む単一ページアプリ |
| `data.json` | 各セグメントのトランスクリプトとトラック情報 |
| `audio/segments/{key}/{nn}.mp3` | セグメント単位の音声ファイル（`adj`/`future`/`past`） |
| `audio/*.mp3,*.m4a` | 元の録音ファイル（文字起こし用） |
| `transcribe.py` | 元音声 → セグメント分割 + Whisper API 文字起こし |
| `transcripts.json` | `transcribe.py` の生出力（参考用） |

### データフロー

```
audio/*.mp3,*.m4a
    ↓ transcribe.py (OpenAI Whisper API)
transcripts.json
    ↓ (手動 or スクリプトで加工)
data.json + audio/segments/{key}/{nn}.mp3
    ↓ fetch() on page load
imitation_player.html
```

### index.html の構造

- `<style>` にCSS全量（CSS変数でテーマ管理）
- `<script>` 内でページ読み込み時に `fetch('data.json')` を実行し、`DATA` 変数にセット
- `DATA` のスキーマ: `[{ label, key, segments: [{ transcript }] }]`
- 音声は `new Audio('audio/segments/' + key + '/' + String(idx).padStart(2,'0') + '.mp3')` で再生
- モバイル対応: JS で DOM 要素を移動する `applyMobileLayout()` によるレイアウト切り替え

## ローカルでの動作確認

`fetch('data.json')` を使用しているため `file://` では動作しない。ローカルサーバーを起動すること：

```bash
uv run python -m http.server 8080
```

http://localhost:8080 をブラウザで開く。終了は `Ctrl+C`。

## 新しいトラックを追加する手順

1. 元音声ファイルを `audio/` に配置
2. `transcribe.py` の `FILES` リストにエントリ追加（`(ファイル名, key, label)`）
3. `OPENAI_API_KEY=sk-... uv run python transcribe.py` を実行
4. 生成された `transcripts.json` の内容を `data.json` に追記（`segments` 配列に変換）
5. `audio/segments/{key}/` にMP3を配置（`transcribe.py` を改修して書き出すか手動で変換）
6. `git add` してコミット

`transcribe.py` の現状: 文字起こし結果のみ `transcripts.json` に保存。セグメントMP3の書き出しは未実装のため、別途対応が必要。

## GitHub Pages

リポジトリのルートから配信。`index.html` がエントリポイント。

Git LFS は使用していない（GitHub PagesがLFSファイルを配信できないため）。音声ファイルは通常のgitオブジェクトとして管理。
