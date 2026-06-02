import { NextResponse } from "next/server";

import { CUSTOMER_COOKIE, TRAINER_COOKIE } from "@/server/auth/jwt";
import { clearSessionCookie } from "@/server/auth/session";
import { toApiError } from "@/server/lib/errors";

/** Clear both session cookies. No auth required; idempotent. */
export async function POST(): Promise<NextResponse> {
  try {
    await clearSessionCookie(TRAINER_COOKIE);
    await clearSessionCookie(CUSTOMER_COOKIE);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
