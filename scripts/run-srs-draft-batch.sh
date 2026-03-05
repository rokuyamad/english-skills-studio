#!/usr/bin/env bash
set -euo pipefail

DRY_RUN=0
CODEX_AUTO=0
DATE_TAG="$(date +%Y%m%d)"
TMP_DIR="${TMPDIR:-/tmp}/srs-draft-batch-${DATE_TAG}"
DRAFTS_JSON="${TMP_DIR}/drafts.json"
ENRICHMENTS_JSON=""

usage() {
  cat <<'EOF'
Usage:
  # Step 1: draft取得（Codexへ渡す用）
  scripts/run-srs-draft-batch.sh --prepare

  # Step 1-3を一括（Codex自動補完）
  scripts/run-srs-draft-batch.sh --codex-auto [--dry-run]

  # Step 2: Codexが作成した enrichments.json を検証/適用
  scripts/run-srs-draft-batch.sh --input /path/to/enrichments.json [--dry-run]

Required environment variables:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
EOF
}

MODE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prepare)
      MODE="prepare"
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --codex-auto)
      CODEX_AUTO=1
      shift
      ;;
    --input=*)
      ENRICHMENTS_JSON="${1#*=}"
      shift
      ;;
    --input)
      if [[ $# -lt 2 ]]; then
        echo "--input requires a file path." >&2
        usage
        exit 2
      fi
      ENRICHMENTS_JSON="$2"
      shift 2
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [[ -z "${SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." >&2
  exit 2
fi

mkdir -p "$TMP_DIR"

echo "[1/2] Fetch draft cards..."
uv run python3 scripts/enrich-srs-drafts.py --list > "$DRAFTS_JSON"

if [[ "$CODEX_AUTO" -eq 1 ]]; then
  RAW_OUT="${TMP_DIR}/codex-enrichments-raw.txt"
  PROMPT_FILE="${TMP_DIR}/codex-enrichments-prompt.txt"
  ENRICHMENTS_JSON="${TMP_DIR}/enrichments.json"

  cat > "$PROMPT_FILE" <<EOF
以下のdraftカード一覧をもとに、SRS補完データをJSON配列で作成してください。
必ず「JSON配列のみ」を出力し、説明文やMarkdownは不要です。

各要素は必ず以下のキーを含めること:
- id
- card_type (word|idiom|phrase)
- term_ja
- example_en
- example_ja

制約:
- example_en には元単語(term_en)を必ず含める
- できるだけ自然で短い文

drafts:
$(cat "$DRAFTS_JSON")
EOF

  echo "[2/2] Generate enrichments via Codex..."
  codex exec --full-auto -C "$PWD" -o "$RAW_OUT" - < "$PROMPT_FILE"

  python3 - <<'PY' "$RAW_OUT" "$ENRICHMENTS_JSON"
import json, sys
raw_path, out_path = sys.argv[1], sys.argv[2]
text = open(raw_path, "r", encoding="utf-8").read().strip()
if text.startswith("```"):
    text = text.strip("` \n")
    if text.startswith("json"):
        text = text[4:].strip()
if text.startswith("[") and text.endswith("]"):
    data = json.loads(text)
else:
    left = text.find("[")
    right = text.rfind("]")
    if left < 0 or right <= left:
        raise SystemExit("Codex output did not contain JSON array.")
    data = json.loads(text[left:right+1])
if not isinstance(data, list):
    raise SystemExit("Codex output is not a JSON array.")
required = {"id", "card_type", "term_ja", "example_en", "example_ja"}
for i, row in enumerate(data):
    if not isinstance(row, dict):
        raise SystemExit(f"row {i} is not object")
    missing = required - set(row.keys())
    if missing:
        raise SystemExit(f"row {i} missing keys: {sorted(missing)}")
open(out_path, "w", encoding="utf-8").write(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
print(f"normalized={len(data)}")
PY
fi

if [[ "$MODE" == "prepare" || (-z "$ENRICHMENTS_JSON" && "$CODEX_AUTO" -eq 0) ]]; then
  echo "[2/2] Draft export completed."
  echo "drafts: $DRAFTS_JSON"
  echo "next: Codexで以下形式の enrichments.json を作成してください。"
  cat <<'EOF'
[
  {
    "id": "card-uuid",
    "card_type": "word",
    "term_ja": "同時に",
    "example_en": "She completed two tasks simultaneously.",
    "example_ja": "彼女は2つの作業を同時に終えた。"
  }
]
EOF
  echo "apply: bash scripts/run-srs-draft-batch.sh --input /path/to/enrichments.json --dry-run"
  exit 0
fi

GENERATED_COUNT="$(python3 - <<'PY' "$ENRICHMENTS_JSON"
import json, sys
with open(sys.argv[1], "r", encoding="utf-8") as f:
    data = json.load(f)
print(len(data) if isinstance(data, list) else 0)
PY
)"

FAILED_COUNT=0

if [[ "$GENERATED_COUNT" -eq 0 ]]; then
  echo "No enrichments found in: $ENRICHMENTS_JSON"
  exit 0
fi

echo "[2/2] Validate apply payload (dry-run of apply script)..."
uv run python3 scripts/enrich-srs-drafts.py --input "$ENRICHMENTS_JSON" --dry-run >/dev/null

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "--dry-run set. Skip DB apply."
  echo "summary: generated=${GENERATED_COUNT} failed=${FAILED_COUNT} applied=0"
  echo "enrichments: ${ENRICHMENTS_JSON}"
  exit 0
fi

echo "Apply enrichments to Supabase..."
uv run python3 scripts/enrich-srs-drafts.py --input "$ENRICHMENTS_JSON"
echo "summary: generated=${GENERATED_COUNT} failed=${FAILED_COUNT} applied=${GENERATED_COUNT}"
echo "enrichments: ${ENRICHMENTS_JSON}"
