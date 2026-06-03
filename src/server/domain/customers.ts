import { Prisma, type Customer } from "@prisma/client";

import { prisma } from "@/server/data/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { hashPassword } from "@/server/lib/password";
import { normalizeName } from "@/server/lib/slug";
import { deleteObject } from "@/server/lib/s3";

/**
 * Customers domain — plain functions (CLAUDE.md rule 3).
 *
 * Imports nothing framework-specific; the route handlers handle parsing, auth
 * cookies, and HTTP mapping. Every query is scoped by `trainerId` so a trainer
 * can never read or mutate another trainer's customers (rule 4). A customer that
 * is not owned surfaces as a 404 NotFoundError — we never leak existence.
 */

/** True only if a group with `groupId` belongs to `trainerId`. */
async function ownsGroup(trainerId: string, groupId: string): Promise<boolean> {
  const group = await prisma.group.findFirst({
    where: { id: groupId, trainerId },
    select: { id: true },
  });
  return group !== null;
}

/** Load a customer scoped to the trainer, or throw 404 if not owned/absent. */
async function getOwnedCustomer(trainerId: string, customerId: string): Promise<Customer> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, trainerId },
  });
  if (!customer) {
    throw new NotFoundError("Customer not found.");
  }
  return customer;
}

/**
 * Create a customer inside one of the trainer's groups. The group must be owned
 * by the trainer (else 404). Per-trainer name uniqueness is enforced by the
 * `@@unique([trainerId, nameNormalized])` constraint (P2002 → 409).
 */
export async function createCustomer(
  trainerId: string,
  input: { groupId: string; name: string; password: string },
): Promise<Customer> {
  if (!(await ownsGroup(trainerId, input.groupId))) {
    throw new NotFoundError("Group not found.");
  }

  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.customer.create({
      data: {
        trainerId,
        groupId: input.groupId,
        name: input.name,
        nameNormalized: normalizeName(input.name),
        passwordHash,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("A customer with that name already exists.");
    }
    throw err;
  }
}

/**
 * Update a customer (rename / move group / reset password). All fields optional,
 * but at least one must be present (empty patch → 400). Ownership of both the
 * customer and any target group is enforced (404). Name collisions → 409.
 */
export async function updateCustomer(
  trainerId: string,
  customerId: string,
  input: { name?: string; password?: string; groupId?: string },
): Promise<Customer> {
  if (
    input.name === undefined &&
    input.password === undefined &&
    input.groupId === undefined
  ) {
    throw new ValidationError("No fields to update.");
  }

  // Confirm ownership before any mutation (rule 4).
  await getOwnedCustomer(trainerId, customerId);

  if (input.groupId !== undefined && !(await ownsGroup(trainerId, input.groupId))) {
    throw new NotFoundError("Group not found.");
  }

  const data: Prisma.CustomerUpdateInput = {};
  if (input.name !== undefined) {
    data.name = input.name;
    data.nameNormalized = normalizeName(input.name);
  }
  if (input.password !== undefined) {
    data.passwordHash = await hashPassword(input.password);
  }
  if (input.groupId !== undefined) {
    data.group = { connect: { id: input.groupId } };
  }

  try {
    return await prisma.customer.update({
      where: { id: customerId },
      data,
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ConflictError("A customer with that name already exists.");
    }
    throw err;
  }
}

/**
 * Delete a customer owned by the trainer (404 if not owned). Prisma cascade
 * removes the customer's entries and reactions rows; MinIO objects are NOT
 * cascaded by Prisma, so we collect the entries' object keys first and delete
 * each one best-effort afterwards — a MinIO failure must never fail the request
 * (rule 11).
 */
export async function deleteCustomer(trainerId: string, customerId: string): Promise<void> {
  await getOwnedCustomer(trainerId, customerId);

  const entries = await prisma.inbodyEntry.findMany({
    where: { customerId },
    select: { objectKey: true },
  });

  await prisma.customer.delete({ where: { id: customerId } });

  for (const { objectKey } of entries) {
    try {
      await deleteObject(objectKey);
    } catch (err) {
      // Best-effort cleanup: the DB row is already gone, so a failed object
      // delete must not fail the request. Log and continue.
      console.error(`Failed to delete MinIO object ${objectKey}:`, err);
    }
  }
}
