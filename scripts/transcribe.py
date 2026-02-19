#!/usr/bin/env python3
"""
音声ファイルをWhisper APIで文字起こしし、セグメントMP3を書き出すスクリプト
使い方: OPENAI_API_KEY="sk-..." uv run python scripts/transcribe.py
※ プロジェクトルートから実行すること
"""

import os, json, io
from pathlib import Path
from pydub import AudioSegment
from pydub.silence import detect_nonsilent
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

FILES = [
    ("audio/business-adjectives.mp3", "adj",    "ビジネス 形容詞"),
    ("audio/business-future.m4a",     "future", "未来 ビジネスシーン"),
    ("audio/business-past.m4a",       "past",   "過去 ビジネス"),
]

results = []

for filename, key, label in FILES:
    path = Path(filename)
    if not path.exists():
        print(f"⚠️  ファイルが見つかりません: {filename}")
        continue

    print(f"\n=== {label} ===")
    audio = AudioSegment.from_file(str(path))
    chunks = detect_nonsilent(audio, min_silence_len=600, silence_thresh=-40)
    print(f"  {len(chunks)} セグメント検出")

    # セグメントMP3 書き出し先ディレクトリを作成（冪等）
    out_dir = Path("audio/segments") / key
    out_dir.mkdir(parents=True, exist_ok=True)

    transcripts = []
    for i, (start, end) in enumerate(chunks):
        seg = audio[max(0, start-200):min(len(audio), end+300)]

        # セグメントMP3 を書き出す（再実行時は上書き）
        seg_path = out_dir / f"{i:02d}.mp3"
        seg.export(seg_path, format="mp3")
        print(f"  [{i+1:02d}/{len(chunks)}] → {seg_path}")

        buf = io.BytesIO()
        seg.export(buf, format="mp3")
        buf.seek(0)
        buf.name = "segment.mp3"

        resp = client.audio.transcriptions.create(
            model="whisper-1",
            file=buf,
            language="en",
            prompt="Business English sentences."
        )
        text = resp.text.strip()
        transcripts.append(text)
        print(f"           {text}")

    results.append({"label": label, "key": key, "transcripts": transcripts})

with open("transcripts.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\n✅ transcripts.json に保存しました（バックアップ用）。")
print("✅ audio/segments/{key}/ にセグメントMP3を書き出しました。")

# data.json を key でupsert
data_path = Path("data.json")
data = json.loads(data_path.read_text(encoding="utf-8")) if data_path.exists() else []

data_by_key = {entry["key"]: entry for entry in data}
for result in results:
    data_by_key[result["key"]] = {
        "label": result["label"],
        "key": result["key"],
        "segments": [{"transcript": t} for t in result["transcripts"]]
    }

# 既存の順序を保ちつつ、新規 key を末尾に追加
all_keys = [e["key"] for e in data] + [
    r["key"] for r in results if r["key"] not in {e["key"] for e in data}
]
data_path.write_text(
    json.dumps([data_by_key[k] for k in all_keys], ensure_ascii=False, indent=2),
    encoding="utf-8"
)
print(f"✅ data.json を更新しました（{len(all_keys)} トラック）。")
