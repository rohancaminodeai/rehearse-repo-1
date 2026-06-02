---
name: <kebab-id, e.g. 4.1-inbody-upload-route>
task: <task number from task-breakdown.md, e.g. 4.1>
lane: <DB | BE | FE | TEST | INFRA | DOCS>
size: <S | M>
status: draft   # draft → in-progress → complete
depends-on: <prior task numbers, e.g. 3.1>
---

# <Task title>

> Lean, OPTIONAL plan doc. Most tasks need only their entry in `docs/task-breakdown.md`. Write one of
> these only when a task is non-trivial enough to benefit. Copy to
> `docs/plans/<YYYYMMDD>_<task>-<slug>.md`; don't edit TEMPLATE.md itself.

## Context
<Why, now. 1–2 sentences. Which FR/AC does it advance?>

**Required reading:** [`CLAUDE.md`](../../CLAUDE.md) · [`mvp-decisions.md`](../mvp-decisions.md) ·
[`requirements.md`](../requirements.md) §<x> · [`task-breakdown.md`](../task-breakdown.md) #<task>.

## Goal & non-goals
- **Goal:** <observable outcome>
- **Non-goals:** <explicitly out of scope — prevent scope creep>

## Files I own (lane glob — must not collide with concurrent lanes)
- `<path/glob>`

## Approach
1. <step>
2. <step>

## Rule check (only the rules this task touches; mark others N/A)
- [ ] §2 No over-engineering — <how>
- [ ] §3 Thin handler; logic in `src/server/domain` — <how>
- [ ] §4 Authorization / no IDOR — <how>
- [ ] §7 Zod on input — <how>
- [ ] §12 Test-first — <how>
- [ ] §17 Stayed in my lane; didn't touch frozen files — <how>

## Test plan (every box reflects a real run; no faked results)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] <feature-specific verification>

## Summary (fill in after the work)
- **What changed:** <files / behavior>
