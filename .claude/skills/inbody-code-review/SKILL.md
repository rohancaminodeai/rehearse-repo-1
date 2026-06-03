---
name: inbody-code-review
description: >-
  Review the current git diff for the InBody Dashboard against the project's CLAUDE.md absolute
  rules — thin route handlers, per-request authorization / IDOR, the two session-role cookies,
  Zod validation at every API boundary, MinIO storage discipline, TS strict, Edge-safe middleware,
  lane/file-ownership discipline, and the green gate. Use this skill whenever the user asks to
  review code, review a diff or PR, check changes before committing, or "look over what I changed"
  on this repo — and use it proactively before any commit so a rule violation is caught early. Not
  for writing new features (use the lane agents) or for generic style nits.
---

# InBody Dashboard — Code Review

You are reviewing a diff on the **InBody Dashboard** (Next.js App Router · Postgres · Prisma · MinIO ·
`jose`+`bcryptjs` · Zod · Vitest). The bar is the project's own contract, not generic taste: the
[`CLAUDE.md`](../../../CLAUDE.md) **absolute rules** are the spec. A rule there always wins. Your job is
to find places where the diff *breaks a rule* — especially the security-critical ones — and report them
precisely, with file:line and a concrete fix. Ride past cosmetic preferences; flag what actually matters.

## Step 1 — Get the diff and its context

Run these to see exactly what changed (prefer the dedicated tools where they fit):

```bash
git diff --stat HEAD                 # what files moved
git diff HEAD                        # unstaged + staged working changes
git diff --staged                    # if reviewing a pre-commit / staged set only
git diff main...HEAD                 # if reviewing a whole feature branch
```

If the diff is empty, say so and stop — there is nothing to review. Read the changed files in full
(not just the hunks) when a rule needs surrounding context — e.g. you cannot judge an authorization
check from a 3-line hunk. Read the relevant doc section before judging a design call:
[`docs/mvp-decisions.md`](../../../docs/mvp-decisions.md),
[`docs/architecture.md`](../../../docs/architecture.md),
[`docs/task-breakdown.md`](../../../docs/task-breakdown.md) (lane/file-ownership matrix).

## Step 2 — Check against the rules that bite

Walk the diff against this checklist. Each item maps to a numbered CLAUDE.md rule — cite the number in
your finding so the author can look it up. The first block is **P0 (security)**: a single miss here is a
blocking finding, not a nit.

### P0 — security & correctness (block the commit)
- **Authorization on every request (§4).** Does each handler/domain path verify the actor *owns* the
  row it touches? A trainer may only reach their own Group/Customer/Entry; a customer only their own
  Entry. A query that filters by `id` but not by `trainerId`/`customerId` is an **IDOR** — P0. Check the
  domain function, not just the UI.
- **Images via the proxy only (§4).** InBody images must be served through the auth-checked
  `GET /api/inbody/[id]/file` route. A public object URL, a presigned URL handed to the client, or a
  bucket set to public is a P0 leak.
- **Two session roles, bound correctly (§5).** `trainer_session` and `customer_session` are distinct
  httpOnly cookies; the customer cookie is bound to its `trainerId` and must not unlock another
  trainer's portal. Login failures return a generic error (no account enumeration).
- **Edge middleware stays Edge (§10).** `src/middleware.ts` may import only `jose` + cookies — **never**
  Prisma or bcrypt. An import of either there will fail at runtime on the Edge.
- **Secrets (§6).** No secret committed; cookies httpOnly + secure in prod; JWT secret from env;
  passwords bcrypt-hashed. Flag any literal secret, key, or password in the diff.

### P1 — contract & architecture
- **Zod at every boundary (§7).** Every API route validates input with Zod *before* any domain call and
  returns `400` with a message on failure — never an unhandled `500`. A handler reading `req.json()`
  straight into domain logic is a finding.
- **Thin handlers (§3).** Route handlers only parse → validate → call domain → format. Non-trivial logic
  belongs in `src/server/domain/*` as plain functions importing nothing framework-specific (no `next/*`,
  `Request`/`Response`, or `cookies()`). Business logic inside a handler is a finding.
- **Storage discipline (§8, §11).** Postgres stores only the object key + metadata. HEIC→JPEG on upload.
  Object keys are UUID-based, never the raw filename. Deleting a customer/group must also delete its
  MinIO objects in app code (Prisma cascade only clears DB rows).
- **Approved stack only (§1).** A new npm dependency or external service without an ADR in
  [`docs/technical-decisions.md`](../../../docs/technical-decisions.md) is a finding — check `package.json`
  diffs especially.
- **No over-engineering (§2).** Flag speculative abstractions: service/repository/DTO layers, a
  state-management lib, queues/caching/feature-flags, pagination before data demands it. Smaller wins.

### P2 — discipline & hygiene
- **TS strict (§9).** No `any`, no `@ts-ignore`, no unsafe `as` casts. Quote the line.
- **Lane / file-ownership (§17).** Did the change edit a file outside its lane's glob, or touch a
  **frozen** file (`prisma/schema.prisma`, `src/shared/types/**`, `src/server/api/_schemas/**`,
  `src/server/lib/**`, `package.json`, `src/components/ui/**`) after the Phase-1 freeze? See the matrix in
  [`docs/task-breakdown.md`](../../../docs/task-breakdown.md).
- **Every screen has empty + error states (§16).** Comments render as plain text — never
  `dangerouslySetInnerHTML`. Flag any raw HTML injection of user content.
- **Tests exist (§12).** New `src/server/*` logic or an API route without a Vitest test is a finding
  (UI tests are pragmatic — logic yes, styling no).
- **Green gate (§13).** `npm run lint`, `npm run typecheck`, `npm test` must pass. If quick to run and
  the diff is small, run them and report real results rather than guessing.

## Step 3 — Report

Output exactly this structure so findings are skimmable and actionable:

```
## Code review — <branch or "working tree">

**Verdict:** APPROVE ✅ | APPROVE WITH NITS 🟡 | REQUEST CHANGES 🔴

### 🔴 Blocking (P0/P1 rule violations)
- **[§N rule name] file.ts:line** — what's wrong in one sentence. → concrete fix.

### 🟡 Should fix (P1/P2)
- **[§N] file.ts:line** — issue → fix.

### 💡 Nits (optional)
- file.ts:line — minor suggestion.

### ✅ Looks good
- one line on what the diff does well / which rules it satisfies cleanly.
```

Rules for the report so it stays useful:
- **Cite the rule number** (`§4`, `§7`, …) on every rule-based finding — it ties the call back to the spec
  and keeps the review objective rather than opinion.
- **One finding per bullet, with file:line and a fix.** "This is unsafe" without a line or a remedy wastes
  the author's time.
- **Don't invent problems to look thorough.** If the diff is clean, `APPROVE ✅` with a short note is the
  correct, valuable answer. A short honest review beats a padded one.
- **Severity honestly:** any P0 miss ⇒ `REQUEST CHANGES 🔴`. Only nits ⇒ `APPROVE WITH NITS 🟡`.
