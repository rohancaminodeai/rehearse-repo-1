# Technical decisions (ADRs) — InBody Dashboard

Short Architecture Decision Records. Each: **Context · Options · Decision · Status**. Detailed
mechanics live in [`architecture.md`](architecture.md). Status values: **Decided** / **Deferred**.

> No ADR is *Open*. Everything needed for the MVP is *Decided*; AI/metrics features are *Deferred*.

---

## ADR-001 — TypeScript strict
**Context.** Money/identity-adjacent app; we want bugs caught at compile time.
**Decision.** TypeScript with `strict: true`. No `any`, no `@ts-ignore`. **Status: Decided.**

## ADR-002 — Web framework: Next.js (App Router)
**Context.** Need UI + API in one codebase for a solo MVP.
**Options.** Next.js · separate React+Node · plain HTML/JS.
**Decision.** **Next.js App Router** — one repo, route handlers for the API, easiest path. Route
handlers stay thin (logic in `src/server/domain`) so the API surface stays clean. **Status: Decided.**

## ADR-003 — Database: PostgreSQL (Docker)
**Context.** Relational data (trainer→group→customer→entry→reaction), constraints matter.
**Decision.** **PostgreSQL** in Docker for dev. Postgres in dev and prod (no SQLite drift).
**Status: Decided.**

## ADR-004 — ORM: Prisma
**Context.** Typed query layer + migrations for a beginner-friendly MVP.
**Options.** Prisma · Drizzle · raw SQL.
**Decision.** **Prisma** — smoothest schema + migration story. **Status: Decided.**

## ADR-005 — Auth: custom JWT + bcrypt (NOT a provider)
**Context.** Two different login types: trainer (email+password) and customer (trainer-scoped
name+password set by the trainer). Standard auth providers don't model the customer flow well.
**Options.** Custom JWT/cookies · Auth.js (NextAuth) · hosted provider.
**Decision.** **Custom**: `bcryptjs` for hashing + `jose` to sign/verify JWTs stored in httpOnly
cookies. Two roles via two cookie names; the customer cookie is bound to its trainer. Simplest exact
fit. **Status: Decided.**
> Note: this differs from provider-based auth on purpose — the customer identity is trainer-scoped and
> has no email.

## ADR-006 — Image storage: MinIO (S3-compatible, Docker)
**Context.** InBody images are large binaries; Postgres should hold metadata only.
**Options.** MinIO (S3) · local filesystem volume · bytea in Postgres.
**Decision.** **MinIO** in Docker via `@aws-sdk/client-s3` (`forcePathStyle: true`). Swappable for
real S3 later. DB stores object key + metadata. Images served only via an auth-checked proxy route
(no public/presigned URLs in MVP). **Status: Decided.**

## ADR-007 — Styling: Tailwind + shadcn/ui
**Decision.** **Tailwind + shadcn/ui** (Dialog for preview modal, Button, Input, Table, Card, Toast,
DropdownMenu). Components are copied into the repo (we own them). **Status: Decided.**
**Amendment (Phase 2, 2026-06-02).** Pinned to **Tailwind v3**. The current `shadcn` CLI is v4 and
targets Tailwind v4 (oklch tokens, `@base-ui/react`), which conflicts with our v3 stack. We therefore
**hand-author** the `src/components/ui/*` primitives in Tailwind v3 (concrete navy/emerald colors) —
still "owned in-repo" per the original decision — and keep only the lightweight runtime helpers
`clsx` + `tailwind-merge` + `class-variance-authority` (`src/lib/utils.ts` `cn`). Interactive
primitives needed later (Dialog/DropdownMenu/Toast/Table) will be added with Radix when those phases
land. Revisit if/when we deliberately migrate to Tailwind v4.

## ADR-008 — Validation: Zod at the API boundary
**Decision.** **Zod** validates every API input; schemas live in `src/server/api/_schemas` and the
inferred types feed `src/shared/types`. **Status: Decided.**

## ADR-009 — Testing: Vitest, no Playwright for MVP
**Context.** TDD is enforced for logic + API; we want speed without E2E overhead now.
**Options.** Vitest+Playwright · Jest · Vitest-only.
**Decision.** **Vitest** for unit + integration (two projects); RTL for logic-bearing components.
**No Playwright/E2E** for MVP — the manual verification flow substitutes. Integration tests run
against dedicated test Postgres + MinIO. **Status: Decided.**

## ADR-010 — HEIC handling: convert to JPEG on upload
**Context.** iPhone InBody photos are often `.heic`, which most browsers can't render in `<img>`.
**Options.** Convert→JPEG · reject HEIC · store as-is (no preview).
**Decision.** **Convert HEIC→JPEG server-side on upload** (`heic-convert`/`sharp`); store the JPEG so
previews always render. Conversion failure → `400`, never a blank preview. **Status: Decided.**

## ADR-011 — Comment model: single trainer comment + one emoji reaction
**Context.** The mockup shows a thread, but the MVP requirement is a trainer comment + customer
reaction.
**Decision.** **Single editable trainer comment text field per entry**; the customer sets **one**
emoji reaction per entry (upsert: same emoji toggles off, different replaces). No multi-message thread.
**Status: Decided.** (Thread is *Deferred*.)

## ADR-012 — Customer portal: one shared link per trainer, name+password login
**Context.** How customers reach and identify themselves in the portal.
**Decision.** **One shared link per trainer** at `/portal/[slug]/login`; the customer types **name +
password**. Names are matched normalized (trim + case-fold) and are unique within a trainer. No
customer list is shown (privacy). **Status: Decided.**

## ADR-013 — Deferred: AI analysis & structured metrics/charts
**Decision.** **Deferred.** No Claude API integration, no numeric metric model, no charts for the MVP.
The AI report card / trend chart / stat-card areas are placeholder or omitted. Revisit post-validation.
**Status: Deferred.**

---

## Summary
| ADR | Topic | Choice | Status |
| --- | --- | --- | --- |
| 001 | Language | TypeScript strict | Decided |
| 002 | Framework | Next.js App Router | Decided |
| 003 | Database | PostgreSQL (Docker) | Decided |
| 004 | ORM | Prisma | Decided |
| 005 | Auth | Custom JWT + bcrypt | Decided |
| 006 | Image storage | MinIO (S3) | Decided |
| 007 | Styling | Tailwind + shadcn/ui | Decided |
| 008 | Validation | Zod at boundary | Decided |
| 009 | Testing | Vitest, no Playwright | Decided |
| 010 | HEIC | Convert→JPEG on upload | Decided |
| 011 | Comments | Single comment + 1 emoji | Decided |
| 012 | Customer portal | Shared link + name/password | Decided |
| 013 | AI & metrics/charts | Deferred | Deferred |
