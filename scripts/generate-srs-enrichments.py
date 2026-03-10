#!/usr/bin/env python3
"""Generate SRS enrichment JSON from draft cards using a local OpenAI-compatible LLM."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.error
import urllib.request


EXPRESSION_RE = re.compile(r"^[a-z]+(?:['-][a-z]+)*(?:\s+[a-z]+(?:['-][a-z]+)*)*$", re.IGNORECASE)


def normalize_term(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().replace("’", "'").replace("`", "'")).lower()


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def infer_card_type(term_en: str) -> str:
    return "phrase" if " " in normalize_term(term_en) else "word"


def contains_term(example_en: str, term_en: str) -> bool:
    return normalize_term(term_en) in normalize_term(example_en)


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
                    "Preserve provided fields unless they are empty. "
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
    if text.startswith("{") and text.endswith("}"):
        return json.loads(text)

    left = text.find("{")
    right = text.rfind("}")
    if left >= 0 and right > left:
        return json.loads(text[left : right + 1])
    raise ValueError("No JSON object found in LLM output.")


def load_drafts(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("drafts file must be a JSON array.")
    return data


def build_prompt(row: dict) -> str:
    term_en = normalize_term(row.get("term_en", ""))
    card_type = normalize_text(row.get("card_type", ""))
    term_ja = normalize_text(row.get("term_ja", ""))
    example_en = normalize_text(row.get("example_en", ""))
    example_ja = normalize_text(row.get("example_ja", ""))
    return (
        "Task: fill missing SRS card fields for Japanese learner.\n"
        f"term_en: {term_en}\n"
        f"current card_type: {card_type or '(missing)'}\n"
        f"current term_ja: {term_ja or '(missing)'}\n"
        f"current example_en: {example_en or '(missing)'}\n"
        f"current example_ja: {example_ja or '(missing)'}\n"
        "Rules:\n"
        "- Keep any non-empty current field unchanged in your answer.\n"
        "- If example_en already exists, do not rewrite it.\n"
        "- If example_ja already exists, do not rewrite it.\n"
        "- If example_en is missing, create one natural short sentence including the exact term_en.\n"
        "- If example_ja is missing, provide a natural Japanese translation of example_en.\n"
        "- card_type must be one of word/phrase/idiom.\n"
        "- Output JSON only.\n"
    )


def validate_item(term_en: str, item: dict) -> dict:
    normalized_term = normalize_term(term_en)
    card_type = normalize_text(item.get("card_type", infer_card_type(normalized_term))).lower()
    term_ja = normalize_text(item.get("term_ja", ""))
    example_en = normalize_text(item.get("example_en", ""))
    example_ja = normalize_text(item.get("example_ja", ""))

    if card_type not in {"word", "idiom", "phrase"}:
        raise ValueError(f"invalid card_type={card_type}")
    if not term_ja:
        raise ValueError("term_ja is empty")
    if not example_en:
        raise ValueError("example_en is empty")
    if not example_ja:
        raise ValueError("example_ja is empty")
    if not contains_term(example_en, normalized_term):
        raise ValueError("example_en must contain original term")

    return {
        "term_en": normalized_term,
        "card_type": card_type,
        "term_ja": term_ja,
        "example_en": example_en,
        "example_ja": example_ja,
    }


def build_final_item(row: dict, generated: dict | None = None) -> dict:
    term_en = normalize_term(row.get("term_en", ""))
    fallback = generated or {}
    merged = {
        "term_en": term_en,
        "card_type": normalize_text(row.get("card_type") or fallback.get("card_type") or infer_card_type(term_en)),
        "term_ja": normalize_text(row.get("term_ja") or fallback.get("term_ja")),
        "example_en": normalize_text(row.get("example_en") or fallback.get("example_en")),
        "example_ja": normalize_text(row.get("example_ja") or fallback.get("example_ja")),
    }
    return validate_item(term_en, merged)


def needs_generation(row: dict) -> bool:
    card_type = normalize_text(row.get("card_type", "")).lower()
    term_ja = normalize_text(row.get("term_ja", ""))
    example_en = normalize_text(row.get("example_en", ""))
    example_ja = normalize_text(row.get("example_ja", ""))
    return not (
        card_type in {"word", "idiom", "phrase"}
        and term_ja
        and example_en
        and example_ja
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
        term_en = normalize_term(str(row.get("term_en", "")))

        if not card_id:
            errors.append({"id": "", "term_en": term_en, "error": "missing id"})
            continue
        if not term_en or not EXPRESSION_RE.match(term_en):
            errors.append({"id": card_id, "term_en": term_en, "error": "invalid term_en"})
            continue

        existing_example_en = normalize_text(row.get("example_en", ""))
        if existing_example_en and not contains_term(existing_example_en, term_en):
            errors.append({"id": card_id, "term_en": term_en, "error": "existing example_en does not contain term_en"})
            continue

        if not needs_generation(row):
            try:
                enrichments.append({"id": card_id, **build_final_item(row)})
            except Exception as err:  # noqa: BLE001
                errors.append({"id": card_id, "term_en": term_en, "error": str(err)})
            continue

        last_err = None
        for attempt in range(1, retries + 1):
            try:
                text = request_chat_completion(
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    timeout_sec=timeout_sec,
                    prompt=build_prompt(row),
                )
                obj = parse_json_object(text)
                enrichments.append({"id": card_id, **build_final_item(row, obj)})
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
