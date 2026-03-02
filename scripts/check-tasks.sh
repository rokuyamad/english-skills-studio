#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

file="TASKS.md"

if [[ ! -f "$file" ]]; then
  echo "ERROR: $file is missing"
  exit 1
fi

required_sections=("Inbox" "Now" "Next" "Later" "Done")
for section in "${required_sections[@]}"; do
  if ! grep -q "^## ${section}$" "$file"; then
    echo "ERROR: missing section: ${section}"
    exit 1
  fi
done

awk '
BEGIN {
  err = 0
  nowOpen = 0
}

function fail(message) {
  print "ERROR: " message > "/dev/stderr"
  err = 1
}

/^## / {
  section = substr($0, 4)
  next
}

/^- \[[ x]\] / {
  if (section == "") {
    fail("task line appears before any section: " $0)
    next
  }

  checkbox = substr($0, 4, 1)
  body = substr($0, 7)
  n = split(body, fields, / \| /)

  if (checkbox == "x") {
    if (n != 7) {
      fail("completed task must have 7 fields: " $0)
      next
    }
  } else {
    if (n != 6) {
      fail("open task must have 6 fields: " $0)
      next
    }
  }

  id = fields[1]
  title = fields[2]
  priority = fields[3]
  owner = fields[4]
  issue = fields[5]
  created = fields[6]
  done = (n == 7) ? fields[7] : ""

  if (id !~ /^T-[0-9]{8}-[0-9]{3}$/) {
    fail("invalid task id: " id)
  }
  if (id in seen) {
    fail("duplicate task id: " id)
  }
  seen[id] = 1

  if (title == "") {
    fail("empty title for " id)
  }
  if (priority !~ /^p[123]$/) {
    fail("invalid priority for " id ": " priority)
  }
  if (owner !~ /^owner:(me|@[A-Za-z0-9][A-Za-z0-9-]*)$/) {
    fail("invalid owner for " id ": " owner)
  }
  if (issue !~ /^issue:(none|#[0-9]+)$/) {
    fail("invalid issue for " id ": " issue)
  }
  if (created !~ /^created:[0-9]{4}-[0-9]{2}-[0-9]{2}$/) {
    fail("invalid created date for " id ": " created)
  }

  if (section == "Done" && checkbox != "x") {
    fail("Done section must contain only completed tasks: " id)
  }
  if (section != "Done" && checkbox == "x") {
    fail("completed task must be in Done section: " id)
  }

  if (checkbox == "x") {
    if (done !~ /^done:[0-9]{4}-[0-9]{2}-[0-9]{2}$/) {
      fail("invalid done date for " id ": " done)
    }
  }

  if (section == "Now" && checkbox == " ") {
    nowOpen++
  }

  next
}

END {
  if (nowOpen > 5) {
    fail("Now section has " nowOpen " open tasks (max: 5)")
  }
  if (err) {
    exit 1
  }
  print "OK: TASKS.md valid"
}
' "$file"
