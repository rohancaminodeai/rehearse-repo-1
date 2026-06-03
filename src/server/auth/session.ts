import { cookies } from "next/headers";

import { AuthError } from "@/server/lib/errors";
import {
  CUSTOMER_COOKIE,
  TRAINER_COOKIE,
  verifySession,
  type CustomerSession,
  type TrainerSession,
} from "@/server/auth/jwt";

/**
 * Cookie-bound session helpers (route-handler side only).
 *
 * This module uses `next/headers` and so must NOT be imported from the Edge
 * middleware — import the pure crypto core from `@/server/auth/jwt` there
 * instead (CLAUDE.md rule 10). The core is re-exported below for convenience so
 * existing `@/server/auth/session` imports keep working.
 */

export {
  signSession,
  verifySession,
  TRAINER_COOKIE,
  CUSTOMER_COOKIE,
  type TrainerSession,
  type CustomerSession,
} from "@/server/auth/jwt";

/** Read the JWT secret from the environment (route-handler side only). */
function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new AuthError("Server misconfiguration.", "AUTH_ERROR");
  }
  return secret;
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
