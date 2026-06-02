# Task breakdown — InBody Dashboard

Slices the work from empty repo to a working MVP into **lane-tagged tasks**, grouped into ordered
phases. **Do not start phase _N+1_ until phase _N_ is green** (`lint && typecheck && test`).

Lane tags: **[DB] · [BE] · [FE] · [TEST] · [INFRA] · [DOCS]**.
Each task: **Goal · Acceptance Criteria (AC) · Depends-on · Lane · Size** (S ≤ ½ day, M ≤ 2 days).

> This document + the Zod/TS contracts are the execution source of truth for sub-agents. Read
> [`CLAUDE.md`](../CLAUDE.md), [`mvp-decisions.md`](mvp-decisions.md), and the relevant FR/NFR in
> [`requirements.md`](requirements.md) before starting.

---

## Parallelization (read before fanning out)

### The contract-freeze gate
Phases 0–1 run **sequentially** and end by **freezing** the shared base. After the freeze, feature
lanes only *import* these — they never edit them and add no new dependencies:
- `package.json` / lockfile · `prisma/schema.prisma` · `src/shared/types/**` ·
  `src/server/api/_schemas/**` · `src/server/lib/**` · `src/components/ui/**`.

### Disjoint file ownership (no two concurrent agents write the same file)
Within a feature phase the three lanes own non-overlapping globs:
- **BE** → `src/app/api/<feature>/**` + `src/server/domain/<feature>.ts`
- **FE** → `src/app/(trainer)/**` & `src/app/portal/**` pages + `src/components/<feature>/**`
- **TEST** → all `*.test.ts` files (ownership by suffix — a file is either a test or it isn't)

Files touched by two phases (e.g. the customer page) are edited by **one agent at a time, serially**,
because phases are ordered — never concurrently.

### FE↔BE decoupling
FE codes against the frozen Zod/TS contract + a typed `fetch` mock; BE implements the same contract;
the TEST lane's integration tests exercise the real BE. They compose with no merge step (disjoint
files) and no drift (frozen types).

### File-ownership matrix (per phase — proves non-collision)

| Phase | BE owns | FE owns | TEST owns |
| --- | --- | --- | --- |
| **1** *(2-way)* | `prisma/**`, `src/shared/types/**`, `src/server/api/_schemas/**`, `src/server/lib/**` | — | `**/*.test.ts` (password/slug/jwt/normalize/reaction/heic) |
| **2 Auth** | `src/app/api/auth/**`, `src/middleware.ts`, `src/server/domain/auth.ts` | `src/app/(trainer)/{login,signup}/page.tsx`, `src/app/portal/[slug]/login/page.tsx`, `src/components/auth/**` | `**/*.test.ts` (auth) |
| **3 Workspace** | `src/app/api/{groups,customers}/**`, `src/server/domain/{groups,customers}.ts` | `src/app/(trainer)/dashboard/{layout,page}.tsx`, `src/components/{sidebar,groups,customers}/**` | `**/*.test.ts` (groups/customers) |
| **4 InBody** | `src/app/api/inbody/**` *(not reaction)*, `src/server/domain/inbody.ts` | `src/components/inbody-module.tsx`, `src/app/(trainer)/dashboard/customers/[customerId]/page.tsx` | `**/*.test.ts` (inbody) |
| **5 Portal+React** | `src/app/api/inbody/[id]/reaction/route.ts`, `src/server/domain/reactions.ts` | `src/app/portal/[slug]/dashboard/page.tsx`, `src/components/{reaction-picker,customer-portal}/**` *(+ reaction badge in inbody-module — serial; P4 done)* | `**/*.test.ts` (reactions/portal) |

### Orchestration recipe
- **Phase 0**: 1 agent (git init + docs + scaffold + harness + docker).
- **Phase 1**: up to 2 parallel — **[DB]** (`prisma/**`) ∥ **[BE-contract]** (`shared/types` +
  `_schemas`); then **[lib]** + **[TEST unit]** test-first.
- **Phases 2–5**: launch **3 agents per phase** (BE ∥ FE ∥ TEST), each scoped to its glob above. When
  they return, run the green gate, then `git commit` the phase before starting the next.
- Spine (ordered, no overlap): **0 → 1 → 2 → 3 → 4 → 5 → 6**.

> Honest note: real 3× parallelism is Phases 2–5. Phases 0–1 are foundational and only lightly
> parallel by design.

---

## Phase 0 — Foundation & Docs  *(sequential, 1 agent)*

### 0.0 [INFRA] git init
**Goal.** Repo + safety net for parallel lanes. **AC.** `git init`, `.gitignore` (Node/Next), initial
commit. **Depends.** — **Size.** S

### 0.1 [DOCS] Documentation suite
**Goal.** Shared context for sub-agents. **AC.** `CLAUDE.md` + `docs/{requirements, technical-decisions,
architecture, task-breakdown, mvp-decisions}.md` + `docs/plans/TEMPLATE.md` exist, lean, consistent.
**Depends.** 0.0 **Size.** M

### 0.2 [INFRA] Scaffold app
**Goal.** Boot a Next.js app. **AC.** `create-next-app` (TS strict, App Router, Tailwind, ESLint,
`src/` dir, import alias `@/*`); shadcn/ui initialized with Dialog, Button, Input, Table, Card, Toast
(Sonner), DropdownMenu, Label, Textarea; Prettier configured; `npm run dev` boots; `npm run lint`
passes. **Depends.** 0.1 **Size.** M

### 0.3 [INFRA] Test harness
**Goal.** Vitest ready. **AC.** `vitest.config.ts` with **unit** (jsdom) + **integration** (node)
projects; `test/setup.ts` (loads `.env.test`, migrates test DB, truncates tables + empties test bucket
between tests); `test/helpers.ts` (factories: trainer/group/customer/entry, auth-cookie helper, MinIO
test helpers); `npm test`, `npm run test:unit`, `npm run typecheck` scripts exist and run green with 0
tests. **Depends.** 0.2 **Size.** M

### 0.4 [INFRA] Docker + env
**Goal.** Postgres + MinIO locally and for tests. **AC.** `docker-compose.yml` (postgres:16 + volume;
minio + volume + console; one-shot `mc` to create the `inbody` bucket); `docker-compose.test.yml`
(postgres-test + minio-test on separate ports/DB/bucket); `.env.example` **mirroring** compose exactly;
`.env.test.example`; `src/server/lib/env.ts` (Zod, fail-fast). `docker compose up -d` healthy; bucket
exists; app refuses to boot without required env. **Depends.** 0.2 **Size.** M

**Exit criteria.** `npm run dev` boots; `npm test` runs green (0 tests); `docker compose up` healthy;
all docs present.

---

## Phase 1 — Contracts & Schema  *(the parallel enabler; freeze at the end)*

### 1.1 [DB] Prisma schema + migration + seed
**Goal.** Persist the data model. **AC.** `prisma/schema.prisma` has Trainer, Group, Customer,
InbodyEntry, Reaction (per [`architecture.md`](architecture.md §3)) with cascades and
`@@unique([trainerId, nameNormalized])`; `prisma migrate dev` runs clean and the migration is checked
in; `prisma/seed.ts` creates a demo trainer + group + customer + one entry. **Depends.** 0.4
**Lane.** DB **Size.** M

### 1.2 [BE] Contracts: Zod + shared types
**Goal.** Freeze the API contract for all endpoints. **AC.** `src/server/api/_schemas/*` Zod schemas
for auth (trainer signup/login, customer login), groups (create), customers (create/patch),
inbody (upload metadata, patch comment), reaction (set); `src/shared/types/*` exports request/response
types (inferred from Zod where possible) consumed by FE + BE. Types compile. **Depends.** 0.2
*(parallel with 1.1)* **Lane.** BE **Size.** M

### 1.3 [BE] lib helpers
**Goal.** Shared server utilities. **AC.** `src/server/data/prisma.ts` (singleton); `src/server/lib/
password.ts` (bcrypt hash/verify); `src/server/auth/*` (jose sign/verify, `getTrainerSession`,
`getCustomerSession`, cookie names/helpers); `src/server/lib/s3.ts` (MinIO client w/ `forcePathStyle`,
`putObject`/`getObjectStream`/`deleteObject`, ensure-bucket); `src/server/lib/heic.ts` (detect +
convert→JPEG); `src/server/lib/errors.ts`; `src/server/lib/slug.ts` (slugify + random fallback) and a
`normalizeName` util. **Depends.** 1.1, 1.2 **Lane.** BE **Size.** M

### 1.4 [TEST] Unit tests (test-first)
**Goal.** Lock pure logic. **AC.** Unit tests for password hash/verify, slug generation + uniqueness
fallback, `normalizeName`, jwt sign/verify (incl. expired/tampered), reaction-toggle decision
(set/replace/remove), HEIC detection. Red→green against 1.3. **Depends.** 1.2 *(parallel with 1.3)*
**Lane.** TEST **Size.** M

**Exit criteria.** Migration applied; contracts + lib compile; unit tests green. **FREEZE** the files
listed in §Parallelization. `git commit`.

---

## Phase 2 — Auth  *(BE ∥ FE ∥ TEST)*

### 2.1 [BE] Auth routes + middleware
**Goal.** Sign in/out for both roles. **AC.** `POST /api/auth/trainer/signup` (email+password+name →
unique slug from name w/ random fallback; dup email → 409; sets `trainer_session`),
`/api/auth/trainer/login` (generic error on bad creds), `/api/auth/logout`,
`POST /api/auth/customer/login` (slug + normalized name + password → sets `customer_session` bound to
trainer; generic error). `src/middleware.ts` (Edge, jose-only) guards `/dashboard/**` →
`/login` and `/portal/[slug]/dashboard` → `/portal/[slug]/login`. **Depends.** P1 **Lane.** BE
**Size.** M

### 2.2 [FE] Auth pages
**Goal.** Login/signup UI. **AC.** Trainer `/signup` + `/login` pages; customer `/portal/[slug]/login`
page (name + password). Styled per mockup (navy/emerald). On success redirect (trainer→`/dashboard`,
customer→`/portal/[slug]/dashboard`). Inline error display. **Depends.** P1 **Lane.** FE **Size.** M

### 2.3 [TEST] Auth integration
**Goal.** Verify auth behavior. **AC.** Integration tests: signup dup-email 409, login wrong-creds
generic error, customer login scoped by slug + name normalization, slug uniqueness/fallback, middleware
redirects for logged-out access. **Depends.** P1 **Lane.** TEST **Size.** M

**Exit.** Green gate + commit.

---

## Phase 3 — Trainer workspace: groups + customers  *(BE ∥ FE ∥ TEST)*

### 3.1 [BE] Groups + customers API
**AC.** `POST/GET /api/groups` (create/list, trainer-owned); `POST /api/customers` (name + password →
bcrypt; **requires a groupId owned by the trainer**; per-trainer normalized-name uniqueness → 409);
`PATCH/DELETE /api/customers/[id]` (edit name/password/group; delete cascades entries + **MinIO
objects**). All ownership-checked. **Depends.** P2 **Lane.** BE **Size.** M

### 3.2 [FE] Sidebar workspace
**AC.** `dashboard/layout.tsx` with the dark collapsible **sidebar** (`components/sidebar.tsx`):
groups toggle open to reveal customers; clicking a customer routes to the customer page. "+ group" /
"+ customer" / edit / delete via modals (`components/{groups,customers}/*`). Empty states (no groups,
empty group). Per-customer **portal login link** with copy button. **Depends.** P2 **Lane.** FE
**Size.** M

### 3.3 [TEST] Workspace integration
**AC.** Group/customer CRUD; ownership/IDOR (other trainer's group/customer → 403/404);
**customer-requires-group**; per-trainer name uniqueness. **Depends.** P2 **Lane.** TEST **Size.** M

**Exit.** Green gate + commit.

---

## Phase 4 — InBody module  *(BE ∥ FE ∥ TEST)*

### 4.1 [BE] InBody routes
**AC.** `POST /api/inbody` (multipart; validate customer-owned + type/size; **HEIC→JPEG**; PUT to
MinIO under UUID key; create row; cleanup object on DB failure); `GET /api/inbody/[id]/file[?download=1]`
(authorize then stream w/ correct Content-Type / Content-Disposition); `PATCH /api/inbody/[id]` (edit
comment); `DELETE /api/inbody/[id]` (remove row **and** MinIO object). **Depends.** P3 **Lane.** BE
**Size.** M

### 4.2 [FE] InBody module UI
**AC.** `components/inbody-module.tsx` rendered by the customer page: drag/drop or click **upload**
zone; entries grid (thumbnail via the file route); **preview modal** (shadcn Dialog); **download**;
**edit comment** inline; **delete** with confirm; comment shown below each entry. Revalidate after each
mutation. Empty state when no entries. **Depends.** P3 **Lane.** FE **Size.** M

### 4.3 [TEST] InBody integration
**AC.** Upload happy path **incl. real HEIC→JPEG**; type/size rejection; file-route IDOR (other
customer's entry → 403); delete removes the MinIO object; comment edit. **Depends.** P3 **Lane.** TEST
**Size.** M

**Exit.** Green gate + commit.

---

## Phase 5 — Customer portal + reactions  *(BE ∥ FE ∥ TEST)*

### 5.1 [BE] Reaction route
**AC.** `PUT /api/inbody/[id]/reaction` (customer-only, owns-entry; body = emoji; **upsert**: same
emoji removes, different replaces; one per entry). **Depends.** P4 **Lane.** BE **Size.** S

### 5.2 [FE] Customer dashboard + reaction
**AC.** `/portal/[slug]/dashboard`: read-only entries list (preview modal + download), trainer comment
shown, **emoji reaction picker** calling the reaction route. Trainer's inbody-module surfaces the
customer's reaction (serial edit; P4 done). Empty state. **Depends.** P4 **Lane.** FE **Size.** M

### 5.3 [TEST] Reaction + portal integration
**AC.** Reaction upsert/toggle/replace idempotent; customer can't read another customer's entries/file;
deleted-customer mid-session → 401/redirect. **Depends.** P4 **Lane.** TEST **Size.** M

**Exit.** Green gate + commit.

---

## Phase 6 — Polish & verification  *(sequential-ish)*

### 6.1 [FE] Empty/error states + UX
**AC.** Every screen has empty + error states; toasts on actions; `router.refresh()` after mutations.
**Depends.** P5 **Lane.** FE **Size.** S

### 6.2 [TEST] Suite + coverage
**AC.** Full Vitest suite green; meaningful coverage on auth, access-control, upload/delete.
**Depends.** P5 **Lane.** TEST **Size.** S

### 6.3 [MANUAL] End-to-end verification
**AC.** Run the [`mvp-decisions.md`](mvp-decisions.md)/plan verification flow: trainer flow (incl. a
real `.heic` upload → preview not blank), customer flow (login → view/download → emoji react → persists
→ trainer sees it), access-control checks (logged-out redirects; cross-customer file fetch blocked).
**Depends.** P5 **Size.** S

---

_Tasks here are the source of truth. Keep this file in sync when a decision changes (CLAUDE.md rule 12)._
