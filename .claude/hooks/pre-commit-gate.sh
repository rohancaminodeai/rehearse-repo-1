#!/usr/bin/env bash
# Claude pre-commit gate — InBody Dashboard (CLAUDE.md §13).
#
# Wired as a PreToolUse hook on `git commit` (see .claude/settings.json). It runs the green gate
# and, on any failure, exits 2 so Claude Code BLOCKS the commit and feeds the failing output back to
# the model. A clean run exits 0 and the commit proceeds untouched.
#
# Run order is cheapest-first (lint → typecheck → test) so a fast failure stops before the slow suite.
set -uo pipefail

# Hooks run from the project root, but don't assume it — anchor to this script's repo.
cd "$(git rev-parse --show-toplevel)" || { echo "pre-commit gate: not in a git repo" >&2; exit 2; }

gate() {
  local label="$1"; shift
  local output
  if ! output="$("$@" 2>&1)"; then
    {
      echo "🔴 Pre-commit gate FAILED — \"$label\" did not pass. Commit blocked (CLAUDE.md §13)."
      echo "Fix the failure below, then commit again."
      echo "----- $label output -----"
      echo "$output"
    } >&2
    exit 2
  fi
}

gate "npm run lint"      npm run lint
gate "npm run typecheck" npm run typecheck
gate "npm test"          npm test

echo "✅ Pre-commit gate passed: lint, typecheck, test." >&2
exit 0
