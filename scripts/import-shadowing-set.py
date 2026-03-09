#!/usr/bin/env python3
"""
公開 Notion ページから Shadowing セットを抽出して data/shadowing-data.json を更新する。

使い方:
  uv run python3 scripts/import-shadowing-set.py --url "https://...notion.site/..."
  uv run python3 scripts/import-shadowing-set.py --url "https://...notion.site/..." --dry-run
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/146.0.0.0 Safari/537.36"
)
WPM_PATTERN = re.compile(r"^\s*(\d+)\.(.+?)\(WPM:(\d+)\)\s*$")
YOUTUBE_PATTERN = re.compile(r"(?:youtu\.be|youtube\.com)", re.IGNORECASE)
ROOT_TOGGLE_TITLE = "練習用教材を開く（▶︎をタップ）"
YOUTUBE_TOGGLE_TITLE = "YouTubeはこちら"


class ImportErrorWithContext(RuntimeError):
    pass


@dataclass
class PageContext:
    page_id: str
    page_url: str
    origin: str
    space_domain: str
    space_id: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import a shadowing set from a public Notion page.")
    parser.add_argument("--url", required=True, help="Public Notion page URL")
    parser.add_argument(
        "--data-path",
        default="data/shadowing-data.json",
        help="Path to shadowing data JSON (default: data/shadowing-data.json)",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print extracted set without writing the file")
    return parser.parse_args()


def post_json(url: str, payload: dict[str, Any], *, origin: str, referer: str) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = Request(
        url,
        data=body,
        headers={
            "content-type": "application/json",
            "accept": "*/*",
            "origin": origin,
            "referer": referer,
            "user-agent": USER_AGENT,
        },
        method="POST",
    )

    try:
        with urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        message = exc.read().decode("utf-8", errors="replace")
        raise ImportErrorWithContext(f"HTTP {exc.code} while requesting {url}: {message}") from exc
    except URLError as exc:
        raise ImportErrorWithContext(f"Network error while requesting {url}: {exc.reason}") from exc


def extract_page_id(url: str) -> tuple[str, str, str]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc.endswith("notion.site"):
        raise ImportErrorWithContext("Expected a public Notion URL on notion.site.")

    match = re.search(r"([0-9a-f]{32})", parsed.path.replace("-", ""))
    if not match:
        raise ImportErrorWithContext("Could not extract a Notion page ID from the URL.")

    raw_page_id = match.group(1)
    page_id = (
        f"{raw_page_id[0:8]}-{raw_page_id[8:12]}-{raw_page_id[12:16]}-"
        f"{raw_page_id[16:20]}-{raw_page_id[20:32]}"
    )
    origin = f"{parsed.scheme}://{parsed.netloc}"
    space_domain = parsed.netloc.split(".")[0]
    return page_id, origin, space_domain


def rich_text_to_plain(title_prop: Any) -> str:
    if not isinstance(title_prop, list):
        return ""

    parts: list[str] = []
    for part in title_prop:
        if isinstance(part, list) and part and isinstance(part[0], str):
            parts.append(part[0])
    return "".join(parts).strip()


def normalize_blocks(record_map: dict[str, Any]) -> dict[str, dict[str, Any]]:
    blocks: dict[str, dict[str, Any]] = {}
    for block_id, wrapper in record_map.get("block", {}).items():
        value = wrapper.get("value", {}) if isinstance(wrapper, dict) else {}
        if isinstance(value, dict) and isinstance(value.get("value"), dict):
            blocks[block_id] = value["value"]
        elif isinstance(value, dict) and value.get("type"):
            blocks[block_id] = value
    return blocks


def get_block_title(block: dict[str, Any]) -> str:
    return rich_text_to_plain(block.get("properties", {}).get("title"))


def get_source_url(block: dict[str, Any]) -> str:
    source = block.get("properties", {}).get("source")
    if (
        isinstance(source, list)
        and source
        and isinstance(source[0], list)
        and source[0]
        and isinstance(source[0][0], str)
    ):
        return source[0][0]
    return ""


def slugify_title(title: str, fallback: str) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    ascii_text = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return ascii_text or fallback.lower()


def normalize_set_label(title: str) -> str:
    normalized = title.strip()
    normalized = normalized.replace("シャドーイング教材", "シャドーイング")
    return normalized


def build_set_id(label: str, page_id: str) -> str:
    fallback = page_id.replace("-", "")[:8]
    slug = slugify_title(label, fallback)
    return f"shadowing-{slug}"


def build_entry_id(set_id: str, index: int) -> str:
    short = set_id.removeprefix("shadowing-") or "set"
    return f"sh-{short}-{index:03d}"


def fetch_page_context(page_url: str) -> PageContext:
    page_id, origin, space_domain = extract_page_id(page_url)
    payload = {
        "type": "block-space",
        "name": "page",
        "blockId": page_id,
        "spaceDomain": space_domain,
        "requestedOnPublicDomain": True,
        "requestedOnExternalDomain": False,
        "embedded": False,
        "showMoveTo": False,
        "saveParent": False,
        "shouldDuplicate": False,
        "projectManagementLaunch": False,
        "configureOpenInDesktopApp": False,
        "mobileData": {"isPush": False},
        "demoWorkspaceMode": False,
    }
    response = post_json(f"{origin}/api/v3/getPublicPageData", payload, origin=origin, referer=page_url)
    space_id = response.get("spaceId")
    if not isinstance(space_id, str) or not space_id:
        raise ImportErrorWithContext("Failed to resolve Notion spaceId from the public page.")
    return PageContext(
        page_id=page_id,
        page_url=page_url,
        origin=origin,
        space_domain=space_domain,
        space_id=space_id,
    )


def load_root_page_blocks(ctx: PageContext) -> dict[str, dict[str, Any]]:
    payload = {
        "page": {"id": ctx.page_id},
        "cursor": {"stack": []},
        "verticalColumns": False,
    }
    response = post_json(
        f"{ctx.origin}/api/v3/loadCachedPageChunkV2",
        payload,
        origin=ctx.origin,
        referer=ctx.page_url,
    )
    return normalize_blocks(response.get("recordMap", {}))


def load_block_subtree(ctx: PageContext, block_id: str) -> dict[str, dict[str, Any]]:
    payload = {
        "requests": [
            {
                "page": {"id": block_id, "spaceId": ctx.space_id},
                "cursor": {"stack": []},
                "verticalColumns": False,
            }
        ],
        "dedupeSessionId": f"shadowing-import-{block_id}",
    }
    response = post_json(
        f"{ctx.origin}/api/v3/loadCachedPageChunks",
        payload,
        origin=ctx.origin,
        referer=ctx.page_url,
    )
    return normalize_blocks(response.get("recordMap", {}))


def collect_shadowing_set(ctx: PageContext) -> dict[str, Any]:
    root_blocks = load_root_page_blocks(ctx)
    page = root_blocks.get(ctx.page_id)
    if not page:
        raise ImportErrorWithContext("Failed to load the target Notion page content.")

    label = get_block_title(page)
    if not label:
        raise ImportErrorWithContext("The target page does not have a usable title.")
    label = normalize_set_label(label)

    set_id = build_set_id(label, ctx.page_id)
    content_ids = page.get("content", [])
    entries: list[dict[str, Any]] = []
    pending_heading: tuple[str, int] | None = None

    for block_id in content_ids:
        block = root_blocks.get(block_id)
        if not block:
            continue

        title = get_block_title(block)
        match = WPM_PATTERN.match(title)
        if match:
            pending_heading = (match.group(2).strip(), int(match.group(3)))
            continue

        if block.get("type") == "toggle" and title == ROOT_TOGGLE_TITLE:
            if pending_heading is None:
                continue
            entry_title, wpm = pending_heading
            pending_heading = None

            subtree = load_block_subtree(ctx, block_id)
            root_toggle = subtree.get(block_id)
            if not root_toggle:
                raise ImportErrorWithContext(f"Failed to load block subtree for '{entry_title}'.")

            youtube_toggle_id = None
            for child_id in root_toggle.get("content", []):
                child = subtree.get(child_id)
                if child and get_block_title(child) == YOUTUBE_TOGGLE_TITLE:
                    youtube_toggle_id = child_id
                    break

            if not youtube_toggle_id:
                raise ImportErrorWithContext(f"'YouTubeはこちら' toggle was not found for '{entry_title}'.")

            youtube_subtree = load_block_subtree(ctx, youtube_toggle_id)
            youtube_toggle = youtube_subtree.get(youtube_toggle_id)
            if not youtube_toggle:
                raise ImportErrorWithContext(f"Failed to load YouTube subtree for '{entry_title}'.")

            youtube_url = ""
            for child_id in youtube_toggle.get("content", []):
                child = youtube_subtree.get(child_id)
                if not child:
                    continue
                source_url = get_source_url(child)
                if YOUTUBE_PATTERN.search(source_url):
                    youtube_url = source_url
                    break

            if not youtube_url:
                raise ImportErrorWithContext(f"YouTube URL was not found for '{entry_title}'.")

            entry_id = build_entry_id(set_id, len(entries) + 1)
            entries.append(
                {
                    "id": entry_id,
                    "title": entry_title,
                    "wpm": wpm,
                    "youtubeUrl": youtube_url,
                }
            )

    if not entries:
        raise ImportErrorWithContext("No shadowing entries were extracted from the page.")

    return {
        "id": set_id,
        "label": label,
        "source": ctx.page_url,
        "entries": entries,
    }


def load_shadowing_data(data_path: Path) -> dict[str, Any]:
    if not data_path.exists():
        return {"sets": []}
    with data_path.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    if not isinstance(data, dict) or not isinstance(data.get("sets"), list):
        raise ImportErrorWithContext(f"Unexpected JSON structure in {data_path}.")
    return data


def ensure_unique_set_id(data: dict[str, Any], new_set: dict[str, Any]) -> None:
    existing_sets = data.get("sets", [])
    current_source = new_set["source"]
    current_id = new_set["id"]
    matching_id = [
        item for item in existing_sets if item.get("id") == current_id and item.get("source") != current_source
    ]
    if not matching_id:
        return

    source_hash = re.sub(r"[^0-9a-z]+", "", current_source.lower())[-8:] or "source"
    suffix = source_hash
    new_set["id"] = f"{current_id}-{suffix}"
    for idx, entry in enumerate(new_set["entries"], start=1):
        entry["id"] = build_entry_id(new_set["id"], idx)


def merge_existing_metadata(existing_set: dict[str, Any], new_set: dict[str, Any]) -> dict[str, Any]:
    merged = dict(new_set)
    if existing_set.get("id"):
        merged["id"] = existing_set["id"]
    if existing_set.get("label"):
        merged["label"] = existing_set["label"]

    existing_entry_ids = {
        entry.get("title"): entry.get("id")
        for entry in existing_set.get("entries", [])
        if isinstance(entry, dict) and entry.get("title") and entry.get("id")
    }

    next_entries = []
    for idx, entry in enumerate(new_set.get("entries", []), start=1):
        next_entry = dict(entry)
        stable_id = existing_entry_ids.get(entry.get("title"))
        next_entry["id"] = stable_id or build_entry_id(merged["id"], idx)
        next_entries.append(next_entry)
    merged["entries"] = next_entries
    return merged


def upsert_shadowing_set(data: dict[str, Any], new_set: dict[str, Any]) -> tuple[dict[str, Any], str, dict[str, Any]]:
    sets = list(data.get("sets", []))
    action = "added"
    final_set = new_set
    replaced = False
    for idx, current in enumerate(sets):
        if current.get("source") == new_set["source"]:
            final_set = merge_existing_metadata(current, new_set)
            sets[idx] = final_set
            replaced = True
            action = "updated"
            break
    if not replaced:
        sets.append(new_set)

    return {"sets": sets}, action, final_set


def main() -> int:
    args = parse_args()
    data_path = Path(args.data_path)

    try:
        ctx = fetch_page_context(args.url)
        new_set = collect_shadowing_set(ctx)
        data = load_shadowing_data(data_path)
        ensure_unique_set_id(data, new_set)
        updated_data, action, final_set = upsert_shadowing_set(data, new_set)
    except ImportErrorWithContext as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    preview = {
        "action": action,
        "set": final_set,
        "dataPath": str(data_path),
        "dryRun": bool(args.dry_run),
    }

    if args.dry_run:
        print(json.dumps(preview, ensure_ascii=False, indent=2))
        return 0

    data_path.write_text(json.dumps(updated_data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(preview, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
