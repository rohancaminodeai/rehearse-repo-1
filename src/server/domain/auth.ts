import type { Customer, Trainer } from "@prisma/client";

import { prisma } from "@/server/data/prisma";
import { AuthError, ConflictError } from "@/server/lib/errors";
import { hashPassword, verifyPassword } from "@/server/lib/password";
import { normalizeName, slugify, uniqueSlug } from "@/server/lib/slug";

/**
 * Auth domain — plain functions (CLAUDE.md rule 3).
 *
 * Imports nothing framework-specific (no `next/*`, `Request`/`Response`,
 * `cookies()`); the route handlers handle parsing, cookie writes, and HTTP
 * mapping. Login failures use a single generic message so a caller can never
 * tell which field was wrong (rules 5/6).
 */

/** Create a trainer: hash password, derive a unique slug, persist. */
export async function signupTrainer(input: {
  email: string;
  password: string;
  name: string;
}): Promise<Trainer> {
  const existing = await prisma.trainer.findUnique({
    where: { email: input.email },
  });
  if (existing) {
    throw new ConflictError("An account with that email already exists.");
  }

  const passwordHash = await hashPassword(input.password);
  const slug = await uniqueSlug(
    slugify(input.name),
    async (s) => !!(await prisma.trainer.findUnique({ where: { slug: s } })),
  );

  return prisma.trainer.create({
    data: {
      email: input.email,
      passwordHash,
      name: input.name,
      slug,
    },
  });
}

/** Verify trainer credentials. Generic error on any failure (rules 5/6). */
export async function loginTrainer(input: {
  email: string;
  password: string;
}): Promise<Trainer> {
  const trainer = await prisma.trainer.findUnique({
    where: { email: input.email },
  });
  if (!trainer) {
    throw new AuthError("Invalid email or password.");
  }

  const ok = await verifyPassword(input.password, trainer.passwordHash);
  if (!ok) {
    throw new AuthError("Invalid email or password.");
  }

  return trainer;
}

/**
 * Verify customer credentials within a trainer's portal (resolved by slug).
 * The lookup is scoped by `trainerId`, so a correct name+password under one
 * trainer never authenticates via another trainer's slug. Generic error on any
 * failure (rules 5/6).
 */
export async function loginCustomer(
  slug: string | null,
  name: string,
  password: string,
): Promise<Customer> {
  if (!slug) {
    throw new AuthError("Invalid name or password.");
  }

  const trainer = await prisma.trainer.findUnique({ where: { slug } });
  if (!trainer) {
    throw new AuthError("Invalid name or password.");
  }

  const customer = await prisma.customer.findUnique({
    where: {
      trainerId_nameNormalized: {
        trainerId: trainer.id,
        nameNormalized: normalizeName(name),
      },
    },
  });
  if (!customer) {
    throw new AuthError("Invalid name or password.");
  }

  const ok = await verifyPassword(password, customer.passwordHash);
  if (!ok) {
    throw new AuthError("Invalid name or password.");
  }

  return customer;
}
