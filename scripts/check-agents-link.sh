#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if [[ ! -L AGENTS.md ]]; then
  echo "ERROR: AGENTS.md must be a symlink to CLAUDE.md"
  exit 1
fi

target="$(readlink AGENTS.md)"
if [[ "$target" != "CLAUDE.md" ]]; then
  echo "ERROR: AGENTS.md must point to CLAUDE.md (current: $target)"
  exit 1
fi

echo "OK: AGENTS.md -> CLAUDE.md"
