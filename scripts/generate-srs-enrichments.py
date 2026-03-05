#!/usr/bin/env python3
"""Generate SRS enrichment JSON from draft cards using a local OpenAI-compatible LLM.

Input draft JSON example:
[
  {"id":"...","term_en":"simultaneously","status":"draft","is_active":false}
]

Output enrichments JSON example:
[
  {
    "id": "...",
    "card_type": "word",
    "term_ja": "同時に",
    "example_en": "She completed two tasks simultaneously.",
    "example_ja": "彼女は2つの作業を同時に終えた。"
  }
]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request


WORD_RE = re.compile(r"^[a-z]+(?:'[a-z]+)*$", re.IGNORECASE)


def normalize_word(value: str) -> str:
    return value.strip().replace("’", "'").lower()


def request_chat_completion(
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout_sec: int,
    prompt: str,
) -> str:
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    payload = {
        "model": model,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are an English-learning content generator. "
                    "Return only one-line JSON object with keys: card_type, term_ja, example_en, example_ja. "
                    "Use natural Japanese and CEFR A2-B1 level English example sentence. "
                    "No markdown, no explanation."
                ),
            },
            {"role": "user", "content": prompt},
        ],
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as res:
            body = res.read().decode("utf-8")
    except urllib.error.HTTPError as err:
        details = err.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"LLM HTTP {err.code}: {details}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"LLM connection error: {err}") from err

    parsed = json.loads(body)
    choices = parsed.get("choices") or []
    if not choices:
        raise RuntimeError("LLM response has no choices.")
    content = (
        choices[0].get("message", {}).get("content", "")
        if isinstance(choices[0], dict)
        else ""
    )
    if not content:
        raise RuntimeError("LLM response content is empty.")
    return str(content).strip()


def parse_json_object(text: str) -> dict:
    # Accept exact JSON or JSON embedded in text.
    if text.startswith("{") and text.endswith("}"):
        return json.loads(text)

    left = text.find("{")
    right = text.rfind("}")
    if left >= 0 and right > left:
        return json.loads(text[left : right + 1])
    raise ValueError("No JSON object found in LLM output.")


def validate_item(word: str, item: dict) -> dict:
    card_type = str(item.get("card_type", "word")).strip().lower()
    term_ja = str(item.get("term_ja", "")).strip()
    example_en = str(item.get("example_en", "")).strip()
    example_ja = str(item.get("example_ja", "")).strip()
    if card_type not in {"word", "idiom", "phrase"}:
        raise ValueError(f"invalid card_type={card_type}")
    if not term_ja:
        raise ValueError("term_ja is empty")
    if not example_en:
        raise ValueError("example_en is empty")
    if not example_ja:
        raise ValueError("example_ja is empty")
    if word.lower() not in example_en.lower():
        raise ValueError("example_en must contain original word")
    return {
        "card_type": card_type,
        "term_ja": term_ja,
        "example_en": example_en,
        "example_ja": example_ja,
    }


def load_drafts(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("drafts file must be a JSON array.")
    return data


def build_prompt(word: str) -> str:
    return (
        f"Word: {word}\n"
        "Task: create one card for Japanese learner.\n"
        "Constraints:\n"
        "- card_type: choose from word/idiom/phrase (usually word)\n"
        "- term_ja: concise meaning in Japanese\n"
        "- example_en: one simple natural sentence including the exact word\n"
        "- example_ja: natural Japanese translation of example_en\n"
        "Output JSON only."
    )


def generate(
    drafts: list[dict],
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout_sec: int,
    retries: int,
    sleep_ms: int,
) -> tuple[list[dict], list[dict]]:
    enrichments: list[dict] = []
    errors: list[dict] = []
    for row in drafts:
        card_id = str(row.get("id", "")).strip()
        term_en = normalize_word(str(row.get("term_en", "")))

        if not card_id:
            errors.append({"id": "", "term_en": term_en, "error": "missing id"})
            continue
        if not term_en or not WORD_RE.match(term_en):
            errors.append({"id": card_id, "term_en": term_en, "error": "invalid single-word term_en"})
            continue

        last_err = None
        for attempt in range(1, retries + 1):
            try:
                text = request_chat_completion(
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    timeout_sec=timeout_sec,
                    prompt=build_prompt(term_en),
                )
                obj = parse_json_object(text)
                valid = validate_item(term_en, obj)
                enrichments.append({"id": card_id, **valid})
                last_err = None
                break
            except Exception as err:  # noqa: BLE001
                last_err = str(err)
                if attempt < retries:
                    time.sleep(max(0, sleep_ms) / 1000.0)

        if last_err:
            errors.append({"id": card_id, "term_en": term_en, "error": last_err})

    return enrichments, errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="input_path", required=True, help="Input drafts JSON path")
    parser.add_argument("--out", dest="output_path", required=True, help="Output enrichments JSON path")
    parser.add_argument("--errors-out", dest="errors_path", default="", help="Output errors JSON path")
    parser.add_argument("--model", default=os.getenv("LOCAL_LLM_MODEL", "gpt-4.1-mini"))
    parser.add_argument("--base-url", default=os.getenv("LOCAL_LLM_BASE_URL", "http://127.0.0.1:11434/v1"))
    parser.add_argument("--api-key", default=os.getenv("LOCAL_LLM_API_KEY", "local"))
    parser.add_argument("--timeout-sec", type=int, default=60)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--sleep-ms", type=int, default=300)
    args = parser.parse_args()

    drafts = load_drafts(args.input_path)
    enrichments, errors = generate(
        drafts,
        base_url=args.base_url,
        api_key=args.api_key,
        model=args.model,
        timeout_sec=args.timeout_sec,
        retries=max(1, args.retries),
        sleep_ms=max(0, args.sleep_ms),
    )

    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump(enrichments, f, ensure_ascii=False, indent=2)
        f.write("\n")

    if args.errors_path:
        with open(args.errors_path, "w", encoding="utf-8") as f:
            json.dump(errors, f, ensure_ascii=False, indent=2)
            f.write("\n")

    print(
        json.dumps(
            {
                "drafts": len(drafts),
                "generated": len(enrichments),
                "failed": len(errors),
                "output": args.output_path,
                "errors_output": args.errors_path or None,
            },
            ensure_ascii=False,
        )
    )
    return 0 if len(enrichments) > 0 or len(drafts) == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
