#!/usr/bin/env python3
"""Update QA card fields by question text.

Usage:
  # List all QA cards
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    uv run python3 scripts/update-qa-card.py --list

  # Update fields (omit flags you don't want to change)
  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
    uv run python3 scripts/update-qa-card.py \
    --question "What services does your company provide?" \
    --example-en "We offer three types of services. ..." \
    --example-ja "私どもは3種類のサービスを提供しています。..." \
    --term-ja "あなたの会社はどのようなサービスを提供していますか？"

  # Skip confirmation prompt
  ... --yes
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


def normalize_question(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip()).lower()


def build_headers(service_role_key: str) -> dict[str, str]:
    return {
        "apikey": service_role_key,
        "Authorization": f"Bearer {service_role_key}",
        "Content-Type": "application/json",
    }


def request_json(method: str, url: str, headers: dict[str, str], payload: dict | None = None):
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


def fetch_qa_cards(base_url: str, headers: dict[str, str]) -> list[dict]:
    query = urllib.parse.urlencode(
        {
            "select": "id,term_en,term_ja,example_en,example_ja,normalized_term,status,is_active",
            "card_type": "eq.qa",
            "order": "created_at.asc",
        }
    )
    url = f"{base_url}/rest/v1/srs_cards?{query}"
    data = request_json("GET", url, headers)
    return data if isinstance(data, list) else []


def find_card_by_question(base_url: str, headers: dict[str, str], normalized: str) -> dict | None:
    query = urllib.parse.urlencode(
        {
            "select": "id,term_en,term_ja,example_en,example_ja,normalized_term",
            "card_type": "eq.qa",
            "normalized_term": f"eq.{normalized}",
        }
    )
    url = f"{base_url}/rest/v1/srs_cards?{query}"
    data = request_json("GET", url, headers)
    if isinstance(data, list) and data:
        return data[0]
    return None


def show_diff(field: str, before: str | None, after: str) -> None:
    before_display = (before or "").replace("\n", "\\n")
    after_display = after.replace("\n", "\\n")
    if len(before_display) > 80:
        before_display = before_display[:77] + "..."
    if len(after_display) > 80:
        after_display = after_display[:77] + "..."
    print(f"  {field}:")
    print(f"    before: {before_display}")
    print(f"    after:  {after_display}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Update QA card fields by question text.")
    parser.add_argument("--list", action="store_true", help="List all QA cards.")
    parser.add_argument("--question", type=str, help="Question text to find the card.")
    parser.add_argument("--example-en", type=str, dest="example_en", help="New English model answer.")
    parser.add_argument("--example-ja", type=str, dest="example_ja", help="New Japanese translation.")
    parser.add_argument("--term-ja", type=str, dest="term_ja", help="New Japanese question hint.")
    parser.add_argument("--term-en", type=str, dest="term_en", help="New question text (also updates normalized_term).")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt.")
    args = parser.parse_args()

    if not args.list and not args.question:
        parser.error("Specify either --list or --question.")

    base_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    service_role_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not service_role_key:
        print("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.", file=sys.stderr)
        return 2

    headers = build_headers(service_role_key)

    if args.list:
        cards = fetch_qa_cards(base_url, headers)
        for card in cards:
            print(f"[{card['id']}]")
            print(f"  Q:  {card['term_en']}")
            print(f"  JA: {card.get('term_ja', '')}")
            print(f"  A:  {(card.get('example_en') or '')[:80]}")
            print()
        print(f"total: {len(cards)} cards")
        return 0

    normalized = normalize_question(args.question)
    card = find_card_by_question(base_url, headers, normalized)
    if card is None:
        print(f"Error: No QA card found for question: {args.question!r}", file=sys.stderr)
        print(f"  (normalized: {normalized!r})", file=sys.stderr)
        return 1

    print(f"Found card: {card['id']}")
    print(f"  Q: {card['term_en']}")

    payload: dict[str, str] = {}
    if args.example_en is not None:
        payload["example_en"] = args.example_en.strip()
    if args.example_ja is not None:
        payload["example_ja"] = args.example_ja.strip()
    if args.term_ja is not None:
        payload["term_ja"] = args.term_ja.strip()
    if args.term_en is not None:
        new_term = args.term_en.strip()
        payload["term_en"] = new_term
        payload["normalized_term"] = normalize_question(new_term)

    if not payload:
        print("Nothing to update. Specify at least one of: --example-en, --example-ja, --term-ja, --term-en")
        return 0

    print("\nChanges to apply:")
    for field, new_value in payload.items():
        show_diff(field, card.get(field), new_value)

    if not args.yes:
        answer = input("\nApply these changes? [y/N] ").strip().lower()
        if answer != "y":
            print("Cancelled.")
            return 0

    query = urllib.parse.urlencode({"id": f"eq.{card['id']}"})
    url = f"{base_url}/rest/v1/srs_cards?{query}"
    request_json("PATCH", url, headers, payload)

    print(f"\n[ok] Updated {len(payload)} field(s) on card {card['id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
