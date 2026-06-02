# MVP decisions — InBody Dashboard

The canonical, implementation-facing summary of every decision made while planning. If you need the
"why," see [`technical-decisions.md`](technical-decisions.md); for "what to build," see
[`requirements.md`](requirements.md) and [`task-breakdown.md`](task-breakdown.md). **When a decision
changes, update this file first** (CLAUDE.md rule 12).

## Product scope
- Two roles: **Trainer** (signup/login, groups, customers, upload + comment, preview/download/edit/
  delete) and **Customer** (trainer-scoped login, view/download own entries, one emoji reaction).
- Hierarchy: **Trainer → Group (monthly "diet pot") → Customer → InbodyEntry → Reaction**. One group
  per customer; a customer cannot exist without a group.
- **IN scope**: image upload + single trainer comment + customer emoji reaction; preview modal,
  download, edit comment, delete; trainer-scoped customer portal.
- **DEFERRED** (placeholder UI or omitted): AI analysis report + `@AI 요약`; structured metrics &
  charts (체지방률 추이, stat cards) → **images only**; two-way comment thread; right-hand 상세 panel;
  측정 회차/주차 + status workflow.

## Stack
- **Next.js (App Router) + TypeScript strict** · **PostgreSQL** (Docker) · **Prisma** · **MinIO**
  (S3, Docker) · custom auth (**bcryptjs + jose**, httpOnly cookies) · **Tailwind + shadcn/ui** ·
  **Zod** · **Vitest** (no Playwright/E2E for MVP).

## Key implementation decisions
- **Auth is custom, two roles.** `trainer_session` `{trainerId}` and `customer_session`
  `{customerId, trainerId}` cookies. Middleware is **Edge** → jose + cookies only (no Prisma/bcrypt).
  Deep ownership checks in route handlers. Generic error on bad login (don't reveal which field).
- **Customer portal = one shared link per trainer** at `/portal/[slug]/login`; customer types
  **name + password**. Name matched **normalized** (trim + lowercase); unique within a trainer. No
  customer list shown (privacy).
- **Images**: stored in MinIO under **UUID object keys**; Postgres holds key + metadata only. Served
  **only** via the auth-checked `GET /api/inbody/[id]/file` proxy (no public/presigned URLs). IDOR = P0.
- **HEIC → JPEG on upload** (`heic-convert`/`sharp`); store the JPEG so previews never blank.
  Conversion failure → 400.
- **Upload order**: put to MinIO → write DB row → on DB failure, delete the object (no orphan).
- **Delete cascades MinIO**: deleting a customer/group removes DB rows (Prisma cascade) **and** the
  corresponding MinIO objects (explicit in domain code).
- **Comment = single editable trainer text field per entry**; **reaction = one emoji per entry**
  (upsert: same emoji removes, different replaces).
- **MinIO S3 client** needs `forcePathStyle: true` + `endpoint: http://localhost:9000`.
- **`.env.example` mirrors `docker-compose.yml`** exactly. `env.ts` validates at startup (fail-fast).

## Process
- **No over-engineering** is the #1 rule — thin handlers, logic in `src/server/domain`, no speculative
  layers/abstractions, reuse libraries.
- **SDD**: spec = `requirements.md` FR/NFR + task AC + Zod/TS contracts. **TDD**: test-first for
  `src/server/*` logic and all API routes; UI tests pragmatic. Green gate = lint + typecheck + test.
- **Docs-first**, then a **parallel-lane build** (DB/BE/FE/Test sub-agents) coordinated by the
  contract-freeze gate + the file-ownership matrix in [`task-breakdown.md`](task-breakdown.md).
- **Isolation**: shared working tree under git; lanes own disjoint files (no worktrees).

## Verification (end-to-end)
1. `cp .env.example .env`, `docker compose up -d` → Postgres + MinIO healthy (console :9001).
2. `docker compose -f docker-compose.test.yml up -d`, then `npm run lint && npm run typecheck &&
   npm test` green (primary gate).
3. `npx prisma migrate dev && npx prisma db seed`, `npm run dev`.
4. Trainer: signup → login → group → customer (set password) → upload (incl. real **.heic** → preview
   not blank) → preview/download/edit/delete; object appears/disappears in MinIO console.
5. Customer: `/portal/[slug]/login` with name+password → dashboard → preview/download → emoji react →
   reload persists → trainer sees reaction.
6. Access control: logged-out `/dashboard` & `/portal/[slug]/dashboard` redirect; customer can't fetch
   another customer's `/api/inbody/[id]/file`.
