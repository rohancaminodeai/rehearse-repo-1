/**
 * Task 3.3 — Groups integration tests (TEST lane).
 *
 * Exercises the real BE group routes against the test Postgres and the mocked
 * next/headers cookie jar. Locks in:
 *  - create (201 + GroupDTO) then list (200 + { trainerSlug, groups: [...] })
 *  - list is scoped to the session trainer only (no cross-trainer leak, rule 4)
 *  - unauthenticated POST/GET → 401
 *
 * Behavioral + independent: setup.ts truncates tables and resets the jar between
 * tests.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { GET as groupsGET, POST as groupsPOST } from "@/app/api/groups/route";
import { POST as customersPOST } from "@/app/api/customers/route";
import type { ApiError, CustomerDTO, GroupDTO } from "@/shared/types";

import {
  createGroup,
  createTrainer,
  createCustomer,
  authAsTrainer,
  authAsCustomer,
  clearAuth,
  callRoute,
} from "../helpers";

const GROUPS_URL = "http://t.local/api/groups";
const CUSTOMERS_URL = "http://t.local/api/customers";

type GroupWithCustomersDTO = GroupDTO & { customers: CustomerDTO[] };
interface GroupsListBody {
  trainerSlug: string;
  groups: GroupWithCustomersDTO[];
}

beforeEach(() => {
  clearAuth();
});

describe("POST /api/groups + GET /api/groups", () => {
  it("creates a group (201 + GroupDTO) then lists it with trainerSlug + empty customers", async () => {
    const trainer = await createTrainer({ slug: "coach-a" });
    await authAsTrainer(trainer.id);

    const created = await callRoute<GroupDTO>(groupsPOST, {
      method: "POST",
      url: GROUPS_URL,
      body: { name: "June Pot", note: "summer cut" },
    });

    expect(created.status).toBe(201);
    expect(created.body.id).toBeTruthy();
    expect(created.body.name).toBe("June Pot");
    expect(created.body.note).toBe("summer cut");
    expect(typeof created.body.createdAt).toBe("string");

    const listed = await callRoute<GroupsListBody>(groupsGET, {
      method: "GET",
      url: GROUPS_URL,
    });

    expect(listed.status).toBe(200);
    expect(listed.body.trainerSlug).toBe(trainer.slug);
    expect(listed.body.groups).toHaveLength(1);
    const [g] = listed.body.groups;
    expect(g.id).toBe(created.body.id);
    expect(g.name).toBe("June Pot");
    expect(g.customers).toEqual([]);
  });
});

describe("GET /api/groups scoping (rule 4)", () => {
  it("returns ONLY the session trainer's groups, never another trainer's", async () => {
    const trainerA = await createTrainer({ slug: "a-coach", email: "a@demo.test" });
    const groupA = await createGroup(trainerA.id, { name: "A Group" });

    const trainerB = await createTrainer({ slug: "b-coach", email: "b@demo.test" });
    await createGroup(trainerB.id, { name: "B Group" });

    await authAsTrainer(trainerA.id);
    const listed = await callRoute<GroupsListBody>(groupsGET, {
      method: "GET",
      url: GROUPS_URL,
    });

    expect(listed.status).toBe(200);
    expect(listed.body.trainerSlug).toBe(trainerA.slug);
    expect(listed.body.groups).toHaveLength(1);
    expect(listed.body.groups[0].id).toBe(groupA.id);
    expect(listed.body.groups.map((g) => g.name)).not.toContain("B Group");
  });
});

describe("unauthenticated group access", () => {
  it("rejects POST with 401 when no session cookie is present", async () => {
    clearAuth();
    const { status, body } = await callRoute<ApiError>(groupsPOST, {
      method: "POST",
      url: GROUPS_URL,
      body: { name: "Nope" },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("rejects GET with 401 when no session cookie is present", async () => {
    clearAuth();
    const { status, body } = await callRoute<ApiError>(groupsGET, {
      method: "GET",
      url: GROUPS_URL,
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });
});

describe("role separation — a customer cookie cannot act on trainer-only routes (rule 5)", () => {
  // The reactions suite covers the forward direction (a trainer cookie on the
  // customer-only reaction route → 401). These lock the symmetric direction:
  // a valid CUSTOMER session must never satisfy a trainer-only route, even when
  // that customer belongs to a real trainer.
  it("rejects POST /api/groups (trainer-only) presented with a customer cookie → 401", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    clearAuth();
    await authAsCustomer(customer.id, trainer.id);

    const { status, body } = await callRoute<ApiError>(groupsPOST, {
      method: "POST",
      url: GROUPS_URL,
      body: { name: "Should Not Exist" },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("rejects POST /api/customers (trainer-only) presented with a customer cookie → 401", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    clearAuth();
    await authAsCustomer(customer.id, trainer.id);

    const { status, body } = await callRoute<ApiError>(customersPOST, {
      method: "POST",
      url: CUSTOMERS_URL,
      body: { groupId: group.id, name: "Nope", password: "plain1234" },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });
});
