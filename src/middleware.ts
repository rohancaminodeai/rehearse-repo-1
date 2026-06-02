import { NextResponse, type NextRequest } from "next/server";

import {
  CUSTOMER_COOKIE,
  TRAINER_COOKIE,
  verifySession,
  type CustomerSession,
  type TrainerSession,
} from "@/server/auth/jwt";

/**
 * Edge route guards (CLAUDE.md rule 10).
 *
 * Uses ONLY `jose` (via the pure crypto core) + cookies — no Prisma, no bcrypt,
 * no env.ts. The secret is read directly from `process.env.JWT_SECRET`. Deep
 * ownership checks (slug ↔ trainer, row existence) happen in route handlers /
 * pages, never here. A missing/tampered/expired token always redirects to the
 * relevant login page; this function never throws (never 500s).
 */

function getSecret(): string {
  return process.env.JWT_SECRET ?? "";
}

async function isValidSession<T>(
  token: string | undefined,
  secret: string,
): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    await verifySession<T>(token, secret);
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const secret = getSecret();

  // Customer portal dashboard: /portal/<slug>/dashboard(/...)
  if (/^\/portal\/[^/]+\/dashboard(\/.*)?$/.test(pathname)) {
    const token = req.cookies.get(CUSTOMER_COOKIE)?.value;
    if (await isValidSession<CustomerSession>(token, secret)) {
      return NextResponse.next();
    }
    const slug = pathname.split("/")[2] ?? "";
    const url = req.nextUrl.clone();
    url.pathname = `/portal/${slug}/login`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Trainer dashboard: /dashboard(/...)
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const token = req.cookies.get(TRAINER_COOKIE)?.value;
    if (await isValidSession<TrainerSession>(token, secret)) {
      return NextResponse.next();
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/portal/:slug/dashboard/:path*"],
};
