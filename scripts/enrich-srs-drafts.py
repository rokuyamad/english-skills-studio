#!/usr/bin/env python3
"""List and enrich draft SRS cards.

Usage:
  1) List drafts
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
       uv run python3 scripts/enrich-srs-drafts.py --list

  2) Apply enrichments from JSON
     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
       uv run python3 scripts/enrich-srs-drafts.py --input enrichments.json

Input JSON format:
[
  {
    "id": "card-uuid",
    "term_en": "social media",
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
import urllib.error
import urllib.parse
import urllib.request


EXPRESSION_RE = re.compile(r"^[a-z]+(?:['-][a-z]+)*(?:\s+[a-z]+(?:['-][a-z]+)*)*$", re.IGNORECASE)


def normalize_term(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().replace("’", "'").replace("`", "'")).lower()


def contains_term(example_en: str, term_en: str) -> bool:
    return normalize_term(term_en) in normalize_term(example_en)


def build_headers(service_role_key: str) -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


def request_json(method: str, url: str, headers: dict[str, str], payload: dict | list | None = None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url=url, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req) as res:
            body = res.read().decode("utf-8")
            if not body:
                return None
            return json.loads(body)
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {err.code}: {body}") from err


def fetch_drafts(base_url: str, headers: dict[str, str]) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "select": "id,user_id,card_type,term_en,term_ja,example_en,example_ja,status,is_active,created_at",
            "status": "eq.draft",
            "order": "created_at.asc",
        }
    )
    url = f"{base_url}/rest/v1/srs_cards?{query}"
    data = request_json("GET", url, headers)
    return data if isinstance(data, list) else []


def apply_enrichments(base_url: str, headers: dict[str, str], enrichments: list[dict], dry_run: bool) -> int:
    applied = 0
    for idx, item in enumerate(enrichments):
        card_id = str(item.get("id", "")).strip()
        term_en = normalize_term(str(item.get("term_en", "")).strip())
        card_type = str(item.get("card_type", "word")).strip().lower()
        term_ja = str(item.get("term_ja", "")).strip()
        example_en = str(item.get("example_en", "")).strip()
        example_ja = str(item.get("example_ja", "")).strip()

        if not card_id:
            raise ValueError(f"Input #{idx + 1}: id is required.")
        if not term_en:
            raise ValueError(f"Input #{idx + 1}: term_en is required.")
        if not EXPRESSION_RE.match(term_en):
            raise ValueError(f"Input #{idx + 1}: invalid term_en={term_en}")
        if card_type not in {"word", "idiom", "phrase"}:
            raise ValueError(f"Input #{idx + 1}: invalid card_type={card_type}")
        if not term_ja or not example_en or not example_ja:
            raise ValueError(f"Input #{idx + 1}: term_ja/example_en/example_ja must be non-empty.")
        if not contains_term(example_en, term_en):
            raise ValueError(f"Input #{idx + 1}: example_en must contain term_en.")

        payload = {
            "term_en": term_en,
            "card_type": card_type,
            "term_ja": term_ja,
            "example_en": example_en,
            "example_ja": example_ja,
            "normalized_term": term_en,
            "status": "ready",
            "is_active": True,
        }

        if dry_run:
            print(f"[dry-run] patch {card_id}: {json.dumps(payload, ensure_ascii=False)}")
            applied += 1
            continue

        query = urllib.parse.urlencode({"id": f"eq.{card_id}"})
        url = f"{base_url}/rest/v1/srs_cards?{query}"
        request_json("PATCH", url, headers, payload)
        applied += 1
        print(f"[ok] patched {card_id}")

    return applied


def load_enrichment_file(path: str) -> list[dict]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("--input must be a JSON array.")
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true", help="List current draft cards.")
    parser.add_argument("--input", type=str, help="JSON file for applying draft enrichments.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and print updates without PATCH.")
    args = parser.parse_args()

    if not args.list and not args.input:
        parser.error("Specify either --list or --input.")

    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_role_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.", file=sys.stderr)
        return 2

    headers = build_headers(service_role_key)

    if args.list:
        drafts = fetch_drafts(base_url, headers)
        print(json.dumps(drafts, ensure_ascii=False, indent=2))
        return 0

    enrichments = load_enrichment_file(args.input)
    count = apply_enrichments(base_url, headers, enrichments, args.dry_run)
    print(f"processed={count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
