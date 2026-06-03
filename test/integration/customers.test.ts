/**
 * Task 3.3 — Customers integration tests (TEST lane).
 *
 * Exercises the real BE customer routes against the test Postgres + test MinIO
 * bucket and the mocked next/headers cookie jar. Locks in:
 *  - create requires an owned group (unowned → 404, missing → 400); pw hashed
 *  - per-trainer normalized name uniqueness (409); same name, other trainer OK
 *  - name normalization collision (409)
 *  - IDOR: A cannot PATCH/DELETE B's customer (404, no existence leak) (rule 4)
 *  - PATCH happy paths: rename / move group / reset password persist; {} → 400
 *  - DELETE cascade: entries removed (DB) + MinIO object cleaned up (rule 11)
 *
 * Behavioral + independent: setup.ts truncates tables, empties the bucket, and
 * resets the jar between tests.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { POST as customersPOST } from "@/app/api/customers/route";
import {
  PATCH as customerPATCHRoute,
  DELETE as customerDELETERoute,
} from "@/app/api/customers/[id]/route";
import type { ApiError, CustomerDTO } from "@/shared/types";

import {
  prisma,
  createTrainer,
  createGroup,
  createCustomer,
  createEntry,
  authAsTrainer,
  clearAuth,
  callRoute,
  putTestObject,
  testObjectExists,
  type RouteHandler,
} from "../helpers";

// The `[id]` handlers take a required dynamic-route context; adapt them to the
// harness's RouteHandler signature (callRoute supplies `{ params }`). No unsafe
// casts — the adapter narrows the ctx the harness passes.
const customerPATCH: RouteHandler = (req, ctx) =>
  customerPATCHRoute(req, ctx as { params: Promise<{ id: string }> });
const customerDELETE: RouteHandler = (req, ctx) =>
  customerDELETERoute(req, ctx as { params: Promise<{ id: string }> });

const CUSTOMERS_URL = "http://t.local/api/customers";
const customerUrl = (id: string): string => `http://t.local/api/customers/${id}`;

beforeEach(() => {
  clearAuth();
});

describe("POST /api/customers — create requires an owned group", () => {
  it("creates a customer (201 + CustomerDTO) with a hashed password and no hash leak", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<CustomerDTO & { passwordHash?: unknown }>(
      customersPOST,
      {
        method: "POST",
        url: CUSTOMERS_URL,
        body: { groupId: group.id, name: "Alice Customer", password: "plain1234" },
      },
    );

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.name).toBe("Alice Customer");
    expect(body.groupId).toBe(group.id);
    // DTO must never leak the hash (or its absence in the response).
    expect(body.passwordHash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    // The persisted row stores a bcrypt hash, never the plaintext.
    const row = await prisma.customer.findUnique({ where: { id: body.id } });
    expect(row).not.toBeNull();
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe("plain1234");
  });

  it("rejects creating a customer in ANOTHER trainer's group with 404 (no leak)", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);

    await authAsTrainer(trainerA.id);
    const { status, body } = await callRoute<ApiError>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: groupB.id, name: "Sneaky", password: "plain1234" },
    });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    // Nothing was created.
    expect(await prisma.customer.count()).toBe(0);
  });

  it("rejects a request with no groupId with 400", async () => {
    const trainer = await createTrainer();
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<ApiError>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { name: "No Group", password: "plain1234" },
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/customers — per-trainer name uniqueness", () => {
  it("rejects a duplicate normalized name under the same trainer (409) but allows it under a different trainer", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const groupA = await createGroup(trainerA.id);

    await authAsTrainer(trainerA.id);
    const first = await callRoute<CustomerDTO>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: groupA.id, name: "Dup Name", password: "plain1234" },
    });
    expect(first.status).toBe(201);

    const second = await callRoute<ApiError>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: groupA.id, name: "Dup Name", password: "plain1234" },
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT");

    // The SAME name under a DIFFERENT trainer is allowed.
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    clearAuth();
    await authAsTrainer(trainerB.id);
    const other = await callRoute<CustomerDTO>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: groupB.id, name: "Dup Name", password: "plain1234" },
    });
    expect(other.status).toBe(201);
  });

  it("treats case + surrounding-space variants as the same normalized name (409)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    await authAsTrainer(trainer.id);

    const first = await callRoute<CustomerDTO>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: group.id, name: "Jane Doe", password: "plain1234" },
    });
    expect(first.status).toBe(201);

    const collision = await callRoute<ApiError>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: group.id, name: "  jane doe ", password: "plain1234" },
    });
    expect(collision.status).toBe(409);
    expect(collision.body.code).toBe("CONFLICT");
  });
});

describe("IDOR — a trainer cannot touch another trainer's customer (rule 4)", () => {
  it("returns 404 for PATCH and DELETE on another trainer's customer, leaving it intact", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    const customerB = await createCustomer(trainerB.id, groupB.id, { name: "Victim" });

    await authAsTrainer(trainerA.id);

    const patched = await callRoute<ApiError>(customerPATCH, {
      method: "PATCH",
      url: customerUrl(customerB.id),
      body: { name: "Hacked" },
      params: { id: customerB.id },
    });
    expect(patched.status).toBe(404);
    expect(patched.body.code).toBe("NOT_FOUND");

    const deleted = await callRoute<ApiError>(customerDELETE, {
      method: "DELETE",
      url: customerUrl(customerB.id),
      params: { id: customerB.id },
    });
    expect(deleted.status).toBe(404);
    expect(deleted.body.code).toBe("NOT_FOUND");

    // B's customer is untouched: still present and not renamed.
    const stillThere = await prisma.customer.findUnique({ where: { id: customerB.id } });
    expect(stillThere).not.toBeNull();
    expect(stillThere?.name).toBe("Victim");
  });
});

describe("PATCH /api/customers/[id] — happy paths", () => {
  it("renames a customer and persists the change", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id, { name: "Old Name" });
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<CustomerDTO>(customerPATCH, {
      method: "PATCH",
      url: customerUrl(customer.id),
      body: { name: "New Name" },
      params: { id: customer.id },
    });

    expect(status).toBe(200);
    expect(body.name).toBe("New Name");
    const row = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(row?.name).toBe("New Name");
  });

  it("rejects renaming onto an existing sibling name under the same trainer (409)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    await createCustomer(trainer.id, group.id, { name: "Taken" });
    const mover = await createCustomer(trainer.id, group.id, { name: "Mover" });
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<ApiError>(customerPATCH, {
      method: "PATCH",
      url: customerUrl(mover.id),
      body: { name: "taken" }, // normalized collision
      params: { id: mover.id },
    });

    expect(status).toBe(409);
    expect(body.code).toBe("CONFLICT");
  });

  it("moves a customer to another owned group and persists it", async () => {
    const trainer = await createTrainer();
    const groupA = await createGroup(trainer.id, { name: "From" });
    const groupB = await createGroup(trainer.id, { name: "To" });
    const customer = await createCustomer(trainer.id, groupA.id);
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<CustomerDTO>(customerPATCH, {
      method: "PATCH",
      url: customerUrl(customer.id),
      body: { groupId: groupB.id },
      params: { id: customer.id },
    });

    expect(status).toBe(200);
    expect(body.groupId).toBe(groupB.id);
    const row = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(row?.groupId).toBe(groupB.id);
  });

  it("resets a customer's password to a new bcrypt hash", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id, { password: "oldpass1" });
    const before = await prisma.customer.findUnique({ where: { id: customer.id } });
    await authAsTrainer(trainer.id);

    const { status } = await callRoute<CustomerDTO>(customerPATCH, {
      method: "PATCH",
      url: customerUrl(customer.id),
      body: { password: "newpass1" },
      params: { id: customer.id },
    });

    expect(status).toBe(200);
    const after = await prisma.customer.findUnique({ where: { id: customer.id } });
    expect(after?.passwordHash).toBeTruthy();
    expect(after?.passwordHash).not.toBe(before?.passwordHash);
    expect(after?.passwordHash).not.toBe("newpass1");
  });

  it("rejects an empty patch ({}) with 400", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<ApiError>(customerPATCH, {
      method: "PATCH",
      url: customerUrl(customer.id),
      body: {},
      params: { id: customer.id },
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("DELETE /api/customers/[id] — cascade + MinIO cleanup (rule 11)", () => {
  it("removes the customer, cascades its entries, and deletes the MinIO object", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);

    const objectKey = `entry-${customer.id}.jpg`;
    await createEntry(customer.id, { objectKey });
    await putTestObject(objectKey);

    // Sanity: the object really exists before delete.
    expect(await testObjectExists(objectKey)).toBe(true);

    await authAsTrainer(trainer.id);
    const { status, body } = await callRoute<{ ok: boolean }>(customerDELETE, {
      method: "DELETE",
      url: customerUrl(customer.id),
      params: { id: customer.id },
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);

    // (a) The customer row is gone.
    expect(await prisma.customer.findUnique({ where: { id: customer.id } })).toBeNull();
    // (b) Its entries cascaded out of the DB.
    expect(await prisma.inbodyEntry.count({ where: { customerId: customer.id } })).toBe(0);
    // (c) The MinIO object was cleaned up best-effort.
    expect(await testObjectExists(objectKey)).toBe(false);
  });
});
