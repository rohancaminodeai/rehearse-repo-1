# CLAUDE.md — InBody Dashboard

Project memory and **absolute rules** for this repo. Every contributor (human or sub-agent) reads
this file **first**, before touching code. If a rule below conflicts with anything else, the rule wins.

## What this project is

A web dashboard where **trainers** upload customers' InBody result images, organize them into monthly
**groups** ("diet pots"), and leave a comment; and where each **customer** logs into a private portal
to view/download their results and react to the trainer's comment with an emoji. MVP scope only.

Read these before starting any task:
- This file (`CLAUDE.md`)
- [`docs/mvp-decisions.md`](docs/mvp-decisions.md) — the canonical decision summary
- [`docs/requirements.md`](docs/requirements.md) §relevant FR/NFR
- [`docs/architecture.md`](docs/architecture.md) §relevant section
- [`docs/task-breakdown.md`](docs/task-breakdown.md) — your task's Goal · AC · Lane · file-ownership

## Absolute rules

1. **Approved stack only.** Next.js (App Router) + TS strict · PostgreSQL · Prisma · MinIO (S3) ·
   `jose` + `bcryptjs` · Tailwind + shadcn/ui · Zod · Vitest. **No new external service or npm
   dependency without an ADR** in [`docs/technical-decisions.md`](docs/technical-decisions.md).
2. **MVP, no over-engineering — the hard rule.** Build the simplest thing that meets the spec; when
   in doubt choose the smaller option. No speculative abstractions, no service/repository/DTO layers,
   no state-management lib, no queues/caching/feature-flags, no pagination until data demands it.
3. **Thin route handlers.** Non-trivial logic lives in `src/server/domain/*` as plain functions that
   import nothing framework-specific (no `next/*`, no `Request`/`Response`, no `cookies()`). Handlers
   only: parse → Zod-validate → call domain → format response.
4. **Authorization on every request (P0).** A trainer may only touch their own customers/entries; a
   customer may only touch their own entries. Images are served **only** through the auth-checked
   proxy route — never a public object URL. Cross-account access (IDOR) is a P0 bug.
5. **Two session roles.** Distinct cookies `trainer_session` / `customer_session`. The customer
   cookie is bound to its `trainerId`; a customer cookie must not unlock another trainer's portal.
6. **Secrets.** Passwords are bcrypt-hashed; the JWT secret comes from env; cookies are httpOnly +
   secure in prod. Never commit secrets; `.env.example` documents names only.
7. **Zod at every API boundary.** Validate all input before any domain call; return `400` with a
   message — never an unhandled `500`.
8. **Storage discipline.** Postgres stores only the object key + metadata. Convert HEIC→JPEG on
   upload. Object keys are UUID-based, never the raw filename.
9. **TS strict.** No `any`, no `@ts-ignore`, no unsafe casts.
10. **Middleware is Edge.** `src/middleware.ts` may use only `jose` + cookies — **never** Prisma or
    bcrypt (they don't run on the Edge runtime). All DB/password work stays in route handlers.
11. **Delete cascades MinIO.** Prisma cascade removes DB rows only. Deleting a customer/group must
    also delete its InBody objects from MinIO in app code (best-effort).
12. **SDD + TDD.** Change behavior ⇒ update `requirements.md` / task AC / the Zod+TS contract first.
    Test-first (Vitest) is mandatory for `src/server/*` logic and all API route handlers; UI tests are
    pragmatic (logic yes, styling no).
13. **Green gate.** `npm run lint`, `npm run typecheck`, and `npm test` must pass before a task is done.
14. **Env validated at startup.** `src/server/lib/env.ts` (Zod) validates required vars; the app
    refuses to boot if one is missing.
15. **`.env.example` mirrors `docker-compose.yml`** exactly — same DB creds/ports, MinIO keys, bucket.
16. **Every screen** has an empty state and an error state. Comments render as plain text (React
    auto-escape; never `dangerouslySetInnerHTML`).
17. **Lane discipline (parallel work).** Stay within your lane's file-ownership glob (see the matrix
    in [`docs/task-breakdown.md`](docs/task-breakdown.md)). Never edit **frozen** files after the
    Phase-1 freeze: `prisma/schema.prisma`, `src/shared/types/**`, `src/server/api/_schemas/**`,
    `src/server/lib/**`, `package.json`, `src/components/ui/**`.

## Commands (filled in after scaffold)

| Command | What |
| --- | --- |
| `npm run dev` | Run the app locally |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (unit + integration) |
| `npm run test:unit` | Vitest unit project only |
| `docker compose up -d` | Postgres + MinIO |
| `npx prisma migrate dev` | Apply migrations |
| `npx prisma db seed` | Seed demo data |

## Conventions

- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`).
- Branch per feature; never commit secrets; run the green gate before committing.
