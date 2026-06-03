/**
 * Task 5.3 — Reaction integration tests (TEST lane).
 *
 * Exercises the real BE reaction route (PUT /api/inbody/[id]/reaction) against
 * the test Postgres + the mocked next/headers cookie jar. Locks in the
 * single-reaction-per-entry upsert/toggle/replace semantics and customer-only
 * access control (CLAUDE.md rules 4/5/12). Specifically:
 *  - create: no reaction → PUT sets one (200, ReactionDTO, exactly one DB row)
 *  - toggle off: same emoji again → null + row removed
 *  - replace: different emoji → still exactly one row, emoji updated
 *  - idempotency/convergence: repeated identical PUTs TOGGLE (not stable)
 *  - invalid emoji / empty body → 400, no row
 *  - access control (P0, rule 4): cross-customer → 404 (no leak); trainer
 *    session → 401 (customer-only); no session → 401
 *  - stale session: customer deleted mid-session → clean 404 (never 500)
 *  - reflected to trainer: the trainer's GET /api/inbody DTO carries the reaction
 *
 * Behavioral + independent: setup.ts truncates tables and resets the jar between
 * tests.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { PUT as reactionPUT } from "@/app/api/inbody/[id]/reaction/route";
import { GET as inbodyGET } from "@/app/api/inbody/route";
import { REACTION_EMOJIS } from "@/server/api/_schemas/reaction";
import type { ApiError, InbodyEntryDTO, ReactionDTO } from "@/shared/types";

import {
  prisma,
  createTrainer,
  createGroup,
  createCustomer,
  createEntry,
  authAsTrainer,
  authAsCustomer,
  clearAuth,
  callRoute,
  type RouteHandler,
} from "../helpers";

// Adapt the dynamic-route handler to the harness's RouteHandler signature.
const reaction: RouteHandler = (req, ctx) =>
  reactionPUT(req, ctx as { params: Promise<{ id: string }> });

const INBODY_URL = "http://test.local/api/inbody";
const reactionUrl = (id: string): string =>
  `http://test.local/api/inbody/${id}/reaction`;

/** Count the reaction rows attached to one entry. */
function reactionCount(entryId: string): Promise<number> {
  return prisma.reaction.count({ where: { inbodyEntryId: entryId } });
}

/** Set up an owned trainer→group→customer→entry chain. */
async function seedChain(customerName = "Test Customer") {
  const trainer = await createTrainer();
  const group = await createGroup(trainer.id);
  const customer = await createCustomer(trainer.id, group.id, { name: customerName });
  const entry = await createEntry(customer.id, { comment: "great work" });
  return { trainer, group, customer, entry };
}

beforeEach(() => {
  clearAuth();
});

describe("PUT /api/inbody/[id]/reaction — upsert/toggle/replace", () => {
  it("creates a reaction when none exists (200 ReactionDTO + exactly one row)", async () => {
    const { trainer, customer, entry } = await seedChain();
    await authAsCustomer(customer.id, trainer.id);

    const { status, body } = await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });

    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(body.emoji).toBe("👍");
    expect(body.id).toBeTruthy();
    expect(typeof body.createdAt).toBe("string");

    // DB has exactly one Reaction row for this entry, with the chosen emoji.
    expect(await reactionCount(entry.id)).toBe(1);
    const row = await prisma.reaction.findUnique({
      where: { inbodyEntryId: entry.id },
    });
    expect(row?.emoji).toBe("👍");
  });

  it("toggles the reaction off when the SAME emoji is sent again (null + row gone)", async () => {
    const { trainer, customer, entry } = await seedChain();
    await authAsCustomer(customer.id, trainer.id);

    const first = await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });
    expect(first.status).toBe(200);
    expect(first.body.emoji).toBe("👍");

    const second = await callRoute<ReactionDTO | null>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });

    expect(second.status).toBe(200);
    expect(second.body).toBeNull();
    expect(await reactionCount(entry.id)).toBe(0);
  });

  it("replaces the emoji when a DIFFERENT one is sent (still exactly one row, updated)", async () => {
    const { trainer, customer, entry } = await seedChain();
    await authAsCustomer(customer.id, trainer.id);

    await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });

    const { status, body } = await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "🔥" },
      params: { id: entry.id },
    });

    expect(status).toBe(200);
    expect(body).not.toBeNull();
    expect(body.emoji).toBe("🔥");

    // One reaction per entry, always — replace updates in place.
    expect(await reactionCount(entry.id)).toBe(1);
    const row = await prisma.reaction.findUnique({
      where: { inbodyEntryId: entry.id },
    });
    expect(row?.emoji).toBe("🔥");
  });

  it("treats repeated identical PUTs as a TOGGLE (not idempotent-stable) and converges deterministically", async () => {
    const { trainer, customer, entry } = await seedChain();
    await authAsCustomer(customer.id, trainer.id);

    // First PUT of "❤️" from empty → creates one row.
    const create = await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "❤️" },
      params: { id: entry.id },
    });
    expect(create.status).toBe(200);
    expect(create.body.emoji).toBe("❤️");
    expect(await reactionCount(entry.id)).toBe(1);

    // Second identical PUT toggles OFF → null + zero rows (NOT a stable repeat).
    const toggleOff = await callRoute<ReactionDTO | null>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "❤️" },
      params: { id: entry.id },
    });
    expect(toggleOff.status).toBe(200);
    expect(toggleOff.body).toBeNull();
    expect(await reactionCount(entry.id)).toBe(0);

    // A third PUT (create again) converges to a single deterministic row.
    const recreate = await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "❤️" },
      params: { id: entry.id },
    });
    expect(recreate.status).toBe(200);
    expect(recreate.body.emoji).toBe("❤️");
    expect(await reactionCount(entry.id)).toBe(1);
  });
});

describe("PUT /api/inbody/[id]/reaction — emoji validation (rule 7)", () => {
  it("rejects an emoji outside the allowlist with 400 and creates no row", async () => {
    const { trainer, customer, entry } = await seedChain();
    await authAsCustomer(customer.id, trainer.id);

    // Sanity: the disallowed emoji is genuinely not in the frozen allowlist.
    expect(REACTION_EMOJIS as readonly string[]).not.toContain("🦄");

    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "🦄" },
      params: { id: entry.id },
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(await reactionCount(entry.id)).toBe(0);
  });

  it("rejects an empty body ({}) with 400 and creates no row", async () => {
    const { trainer, customer, entry } = await seedChain();
    await authAsCustomer(customer.id, trainer.id);

    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: {},
      params: { id: entry.id },
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(await reactionCount(entry.id)).toBe(0);
  });
});

describe("PUT /api/inbody/[id]/reaction — access control (P0, rule 4/5)", () => {
  it("blocks a DIFFERENT customer from reacting on another customer's entry with 404 (no leak, no row)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customerA = await createCustomer(trainer.id, group.id, { name: "Alice" });
    const customerB = await createCustomer(trainer.id, group.id, { name: "Bob" });
    const entryB = await createEntry(customerB.id);

    // Customer A authenticates and tries to react on B's entry.
    await authAsCustomer(customerA.id, trainer.id);
    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entryB.id),
      body: { emoji: "👍" },
      params: { id: entryB.id },
    });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    // No reaction was written on B's entry.
    expect(await reactionCount(entryB.id)).toBe(0);
  });

  it("rejects a TRAINER session (no customer cookie) with 401 — reactions are customer-only", async () => {
    const { trainer, entry } = await seedChain();
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
    expect(await reactionCount(entry.id)).toBe(0);
  });

  it("rejects an unauthenticated request with 401", async () => {
    const { entry } = await seedChain();
    clearAuth();

    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
    expect(await reactionCount(entry.id)).toBe(0);
  });

  it("blocks a customer bound to a DIFFERENT trainer from another trainer's entry with 404 (no leak)", async () => {
    // Trainer X owns the entry; a customer of trainer Y (whose own customer id is
    // unrelated) tries to react. Ownership is by customerId → wrong customer → 404.
    const { entry: entryX } = await seedChain("X Customer");

    const trainerY = await createTrainer({ email: "y@demo.test" });
    const groupY = await createGroup(trainerY.id);
    const customerY = await createCustomer(trainerY.id, groupY.id, { name: "Y Customer" });

    await authAsCustomer(customerY.id, trainerY.id);
    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entryX.id),
      body: { emoji: "👍" },
      params: { id: entryX.id },
    });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(await reactionCount(entryX.id)).toBe(0);
  });
});

describe("PUT /api/inbody/[id]/reaction — stale session (not 500)", () => {
  it("returns a clean 404 ApiError (never 500) when the session's customer was deleted mid-session", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id, { name: "Ghost" });
    const entry = await createEntry(customer.id);

    // Authenticate, then delete the customer (cascades the entry away).
    await authAsCustomer(customer.id, trainer.id);
    await prisma.customer.delete({ where: { id: customer.id } });

    const { status, body } = await callRoute<ApiError>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "👍" },
      params: { id: entry.id },
    });

    // The key assertion: a well-formed 404, never an unhandled 500.
    expect(status).toBe(404);
    expect(status).not.toBe(500);
    expect(body.code).toBe("NOT_FOUND");
    expect(typeof body.message).toBe("string");
  });
});

describe("reaction reflected to the trainer's entry list", () => {
  it("includes the customer's reaction in the trainer's GET /api/inbody DTO", async () => {
    const { trainer, customer, entry } = await seedChain();

    // Customer reacts.
    await authAsCustomer(customer.id, trainer.id);
    const reacted = await callRoute<ReactionDTO>(reaction, {
      method: "PUT",
      url: reactionUrl(entry.id),
      body: { emoji: "🎉" },
      params: { id: entry.id },
    });
    expect(reacted.status).toBe(200);
    expect(reacted.body.emoji).toBe("🎉");

    // The owning trainer lists the customer's entries and sees the reaction.
    clearAuth();
    await authAsTrainer(trainer.id);
    const { status, body } = await callRoute<InbodyEntryDTO[]>(inbodyGET, {
      method: "GET",
      url: `${INBODY_URL}?customerId=${customer.id}`,
    });

    expect(status).toBe(200);
    const dto = body.find((e) => e.id === entry.id);
    expect(dto).toBeDefined();
    expect(dto?.reaction).not.toBeNull();
    expect(dto?.reaction?.emoji).toBe("🎉");
  });
});
