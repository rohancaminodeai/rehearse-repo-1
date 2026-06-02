#!/usr/bin/env bash
# Auto code-review trigger — InBody Dashboard.
#
# Wired as a Stop hook (see .claude/settings.json): when Claude finishes a turn that touched code,
# this asks Claude to run the `code-reviewer` sub-agent (which runs the inbody-code-review skill) on
# the whole working diff before the turn ends. Reviewing the FULL diff once per turn — not per file —
# is what lets the reviewer catch cross-file issues like IDOR.
#
# Loop-guard: it records a hash of the current change-set. If the change-set is unchanged since the
# last time it fired (e.g. the read-only review just ran without editing anything), it stays quiet and
# lets the turn end. Make new edits → the hash changes → it asks for a fresh review.
set -uo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0   # not a git repo → nothing to do

# Snapshot the working tree: porcelain captures staged/untracked file presence, `diff HEAD` captures
# the actual tracked edits. Together they change whenever the reviewable state changes.
snapshot="$(git status --porcelain=v1 2>/dev/null; git diff HEAD 2>/dev/null)"
[ -z "$snapshot" ] && exit 0   # clean tree → nothing changed → allow stop

# Only nag for *code* changes — docs/plans edits shouldn't trigger a review.
changed_files="$( { git diff HEAD --name-only; git status --porcelain=v1 | sed 's/^...//'; } 2>/dev/null | sort -u )"
code_files="$(printf '%s\n' "$changed_files" | grep -E '\.(ts|tsx|js|jsx|mjs|cjs|prisma)$' || true)"
[ -z "$code_files" ] && exit 0   # only non-code changed → allow stop

# Loop-guard via a marker inside .git (never committed; survives across turns in the session).
marker="$(git rev-parse --git-dir)/claude-review-marker"
hash="$(printf '%s' "$snapshot" | shasum -a 256 | cut -d' ' -f1)"
if [ -f "$marker" ] && [ "$(cat "$marker" 2>/dev/null)" = "$hash" ]; then
  exit 0   # this exact change-set was already flagged for review → don't re-ask
fi
printf '%s' "$hash" > "$marker"

# Block the stop and tell Claude to review. `decision:block` + reason is fed back to the model.
file_list="$(printf '%s\n' "$code_files" | sed 's/^/  - /')"
reason="Code files changed this turn — review the diff before finishing.
Use the **code-reviewer** sub-agent (it runs the inbody-code-review skill) on the current git diff
(\`git diff HEAD\`), then report its verdict to the user. Changed code files:
${file_list}
If the verdict is REQUEST CHANGES 🔴, surface the blocking findings; do not silently move on."

# Emit the control JSON. jq builds it so the multi-line reason is escaped correctly.
jq -n --arg reason "$reason" '{decision: "block", reason: $reason}'
exit 0
