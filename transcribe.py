#!/usr/bin/env python3
"""
音声ファイルをWhisper APIで文字起こしするスクリプト
使い方: OPENAI_API_KEY="sk-..." python3 transcribe.py
"""

import os, json, io
from pathlib import Path
from pydub import AudioSegment
from pydub.silence import detect_nonsilent
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

FILES = [
    ("business-adjectives.mp3", "adj",    "ビジネス 形容詞"),
    ("business-future.m4a",     "future", "未来 ビジネスシーン"),
    ("business-past.m4a",       "past",   "過去 ビジネス"),
].mp3",  "adj",    "ビジネス 形容詞"),
    ("イミテーション(未来、ビジネスシーン).m4a", "future", "未来 ビジネスシーン"),
    ("イミテーション（過去_ビジネス).m4a",      "past",   "過去 ビジネス"),
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

    transcripts = []
    for i, (start, end) in enumerate(chunks):
        seg = audio[max(0, start-200):min(len(audio), end+300)]

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
        print(f"  [{i+1:02d}/{len(chunks)}] {text}")

    results.append({"label": label, "key": key, "transcripts": transcripts})

with open("transcripts.json", "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\n✅ transcripts.json に保存しました。このファイルをClaudeに渡してください。")
