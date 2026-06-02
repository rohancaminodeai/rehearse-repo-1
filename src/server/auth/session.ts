import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";

import { AuthError } from "@/server/lib/errors";

/**
 * Session auth core.
 *
 * The sign/verify *core* takes the secret as a plain string argument so it stays
 * Edge-safe and unit-testable and does NOT import env.ts (CLAUDE.md rule 10).
 * Only the cookie getter/setter helpers (which run in route handlers) read
 * `process.env.JWT_SECRET` and use `next/headers`.
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

/** Read the JWT secret from the environment (route-handler side only). */
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AuthError("Server misconfiguration.", "AUTH_ERROR");
  }
  return secret;
}

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

/** Read + verify the trainer session cookie. Returns null if missing/invalid. */
export async function getTrainerSession(): Promise<TrainerSession | null> {
  const store = await cookies();
  const token = store.get(TRAINER_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySession<TrainerSession>(token, getSecret());
  } catch {
    return null;
  }
}

/** Read + verify the customer session cookie. Returns null if missing/invalid. */
export async function getCustomerSession(): Promise<CustomerSession | null> {
  const store = await cookies();
  const token = store.get(CUSTOMER_COOKIE)?.value;
  if (!token) return null;
  try {
    return await verifySession<CustomerSession>(token, getSecret());
  } catch {
    return null;
  }
}

/** Set a session cookie (httpOnly, sameSite lax, secure in prod). */
export async function setSessionCookie(name: string, token: string): Promise<void> {
  const store = await cookies();
  store.set(name, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
}

/** Clear a session cookie. */
export async function clearSessionCookie(name: string): Promise<void> {
  const store = await cookies();
  store.set(name, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}
