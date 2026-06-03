import { type Customer, type Group } from "@prisma/client";

import { prisma } from "@/server/data/prisma";

/**
 * Groups domain — plain functions (CLAUDE.md rule 3).
 *
 * Imports nothing framework-specific; the route handlers handle parsing, auth
 * cookies, and HTTP mapping. Every query is scoped by `trainerId` so a trainer
 * can never read or mutate another trainer's groups (rule 4).
 */

/** A group together with its customers (for the sidebar listing). */
export type GroupWithCustomers = Group & { customers: Customer[] };

/**
 * List the trainer's groups (oldest first), each with its customers (oldest
 * first). Scoped by `trainerId`.
 */
export async function listGroups(trainerId: string): Promise<GroupWithCustomers[]> {
  return prisma.group.findMany({
    where: { trainerId },
    orderBy: { createdAt: "asc" },
    include: {
      customers: { orderBy: { createdAt: "asc" } },
    },
  });
}

/** Create a group under the trainer. */
export async function createGroup(
  trainerId: string,
  input: { name: string; note?: string },
): Promise<Group> {
  return prisma.group.create({
    data: {
      trainerId,
      name: input.name,
      note: input.note ?? null,
    },
  });
}
