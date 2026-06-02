# Architecture — InBody Dashboard

The **shape** of the system. Requirements live in [`requirements.md`](requirements.md); stack choices
in [`technical-decisions.md`](technical-decisions.md). Read in ~10 minutes.

## 1. Layers

```
UI        (pages, components, forms)        ← what the user sees
API       (route handlers in src/app/api)   ← parse, Zod-validate, authorize, format
Domain    (src/server/domain/* functions)   ← business logic, framework-agnostic
Data/Lib  (Prisma client, MinIO, helpers)   ← rows + objects in/out
```
Rule: a layer talks only to the one below it. **No SQL in a component; no role checks inside a query.**
Route handlers stay thin and delegate to `src/server/domain/*` plain functions that import nothing
framework-specific (no `next/*`, `Request`/`Response`, or `cookies()`). This keeps logic unit-testable
and is what lets the BE lane be tested independently of the FE lane.

## 2. Two-role auth model

Two independent session types, each a signed JWT (`jose`) in an httpOnly cookie:

| Role | Cookie | Payload | Guards |
| --- | --- | --- | --- |
| Trainer | `trainer_session` | `{ trainerId }` | `/dashboard/**`, trainer APIs |
| Customer | `customer_session` | `{ customerId, trainerId }` | `/portal/[slug]/dashboard`, reaction/file reads |

- **Middleware (`src/middleware.ts`) is Edge runtime** → verifies the JWT with `jose` and checks cookie
  presence only. **No Prisma, no bcrypt** there. Deep ownership checks happen in route handlers.
- The customer cookie is **bound to its `trainerId`**; the portal route confirms it matches the URL
  `[slug]`, so a customer session never unlocks another trainer's portal.
- **Authorization is enforced in every route handler / domain call**, not just the UI:
  - Trainer request → the target Group/Customer/Entry must belong to `trainerId`.
  - Customer request → the target Entry must belong to `customerId`.
- **Images are served only via `GET /api/inbody/[id]/file`**, which authorizes first, then streams from
  MinIO. There are no public or presigned object URLs in the MVP. (IDOR here = P0.)

## 3. Data model

```
Trainer    id, email(unique), passwordHash, name, slug(unique), createdAt
Group      id, trainerId→Trainer, name, note?, createdAt
Customer   id, trainerId→Trainer, groupId→Group, name, nameNormalized, passwordHash, createdAt
           @@unique([trainerId, nameNormalized])
InbodyEntry id, customerId→Customer, objectKey, originalFilename, contentType, comment?,
            createdAt, updatedAt
Reaction   id, inbodyEntryId→InbodyEntry (unique: one per entry), emoji, createdAt
```
- `householdId`-style denormalization isn't needed at this scale; we filter by the owning FK.
- **Cascade**: deleting a Customer cascades its Entries + Reactions (DB). Deleting a Customer **or**
  Group must **also delete the MinIO objects** for those entries — Prisma cascade does not touch object
  storage, so the domain delete function fetches object keys and removes them from MinIO (best-effort).
- `nameNormalized` = `name.trim().toLowerCase()` (or locale-safe fold). Written on create; used for the
  uniqueness constraint and for customer login matching.

## 4. Upload / storage flow

```
Trainer uploads file ─▶ POST /api/inbody (multipart)
  1. Zod-validate (customerId belongs to trainer; file present)
  2. Validate type (jpeg/png/webp/heic) + size (~10MB)
  3. If HEIC ─▶ convert to JPEG (contentType=image/jpeg, filename→.jpg)
  4. PUT object to MinIO under a UUID key
  5. Create InbodyEntry row { objectKey, originalFilename, contentType, comment? }
     └─ if the DB write fails, delete the just-uploaded object (no orphan)

Preview/Download ─▶ GET /api/inbody/[id]/file[?download=1]
  authorize (trainer owns customer | customer owns entry) ─▶ stream from MinIO
  with correct Content-Type; ?download=1 sets Content-Disposition: attachment
```

## 5. Folder structure

```
src/
  shared/types/             # API contract TS types (shared FE + BE) — the parallelization seam (FROZEN)
  server/
    api/_schemas/           # Zod request/response schemas (FROZEN after Phase 1)
    auth/                   # jose sign/verify, getTrainerSession / getCustomerSession
    data/                   # Prisma client singleton + small scoped query helpers
    domain/                 # plain functions: auth, groups, customers, inbody, reactions
    lib/                    # env (zod), errors, password (bcrypt), s3 (minio), heic (FROZEN)
  app/
    (trainer)/{login,signup}/page.tsx
    (trainer)/dashboard/{layout,page}.tsx
    (trainer)/dashboard/customers/[customerId]/page.tsx
    portal/[slug]/{login,dashboard}/page.tsx
    api/auth/{trainer/signup,trainer/login,logout,customer/login}/route.ts
    api/{groups, customers, customers/[id]}/route.ts
    api/inbody/{route, [id]/route, [id]/file/route, [id]/reaction/route}.ts
  components/               # sidebar.tsx, inbody-module.tsx, feature folders, ui/* (shadcn — FROZEN)
  middleware.ts             # Edge: route guards
prisma/{schema.prisma (FROZEN), seed.ts}
test/{setup.ts, helpers.ts}   vitest.config.ts
docker-compose.yml  docker-compose.test.yml  .env.example  .env.test.example
```

## 6. Cross-cutting

- **Validation**: Zod at every endpoint before any domain call. Inferred types → `src/shared/types`.
- **Errors**: a small set — `ValidationError`, `AuthError`, `NotFoundError`, `ConflictError`,
  `InternalError`. Domain throws structured errors; the API layer maps them to HTTP codes. No stack
  traces to the client.
- **Config**: `src/server/lib/env.ts` validates required env at startup; the app refuses to boot if a
  var is missing. `.env.example` mirrors `docker-compose.yml` exactly.
- **UI**: every screen has empty + error states; comments are plain text (no `dangerouslySetInnerHTML`).

## 7. Parallel-lane map (sub-agent execution)

Phases are ordered; within a feature phase, **BE / FE / Test lanes run concurrently** against the
frozen contracts. The authoritative file-ownership matrix is in
[`task-breakdown.md`](task-breakdown.md) §"Parallelization". The freeze (end of Phase 1) makes this
safe: `prisma/schema.prisma`, `src/shared/types/**`, `src/server/api/_schemas/**`,
`src/server/lib/**`, `package.json`, and `src/components/ui/**` are not edited afterward — only imported.

## 8. Anti-goals (MVP)

No microservices, no queues/caching, no plugin system, no multi-tenant infra isolation, no realtime,
no i18n framework, no premature performance work. One deployable Next.js app + Postgres + MinIO.
