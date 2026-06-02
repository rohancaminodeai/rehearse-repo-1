import { PrismaClient } from "@prisma/client";

/**
 * PrismaClient singleton.
 *
 * In development, Next.js hot-reload re-evaluates modules, which would create a
 * new PrismaClient (and a new connection pool) on every change. Cache the
 * instance on `globalThis` so we reuse one. In production we never cache.
 */
const globalForPrisma = globalThis as unknown as {
  __prisma?: PrismaClient;
};

export const prisma: PrismaClient = globalForPrisma.__prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
