import { jwtVerify, SignJWT } from "jose";

import { AuthError } from "@/server/lib/errors";

/**
 * Edge-safe session crypto core.
 *
 * This module imports ONLY `jose` (+ a pure error class) and must stay free of
 * `next/headers`, Prisma, bcrypt, and env.ts so it can be imported from the Edge
 * middleware (CLAUDE.md rule 10). The sign/verify functions take the secret as a
 * plain string argument; the cookie getters that read `process.env.JWT_SECRET`
 * and `cookies()` live in `session.ts` (route-handler side only).
 */

export interface TrainerSession {
  trainerId: string;
}

export interface CustomerSession {
  customerId: string;
  trainerId: string;
}

export const TRAINER_COOKIE = "trainer_session";
export const CUSTOMER_COOKIE = "customer_session";

const DEFAULT_EXPIRES_IN = "7d";

/**
 * Sign a session JWT (HS256). Sets `iat` automatically and `exp` from
 * `opts.expiresIn` (default 7d).
 */
export async function signSession(
  payload: Record<string, unknown>,
  secret: string,
  opts?: { expiresIn?: string },
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(opts?.expiresIn ?? DEFAULT_EXPIRES_IN)
    .sign(key);
}

/**
 * Verify a session JWT and return its payload cast to `T`. Throws on a tampered,
 * expired, or wrong-secret token (never returns null).
 *
 * NOTE: the `as T` cast is a structural assertion, not a runtime guarantee.
 * Callers must still treat fields like `trainerId` as untrusted input and
 * confirm the referenced row exists before acting on it.
 */
export async function verifySession<T>(token: string, secret: string): Promise<T> {
  const key = new TextEncoder().encode(secret);
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return payload as T;
  } catch {
    throw new AuthError("Invalid session.", "AUTH_ERROR");
  }
}
