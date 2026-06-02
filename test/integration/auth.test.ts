/**
 * Task 2.3 — Auth integration tests (TEST lane).
 *
 * Exercises the real BE auth routes + Edge middleware against the test Postgres
 * and the mocked next/headers cookie jar. Locks in:
 *  - signup success / duplicate-email 409 / weak-password 400
 *  - slug uniqueness + non-ASCII fallback
 *  - login generic error (no field leak)
 *  - customer login scoped by slug + name normalization (no IDOR via auth)
 *  - logout clears both cookies + is idempotent
 *  - middleware guards (redirect, never 500, valid pass-through)
 *
 * Behavioral + independent: setup.ts truncates tables and resets the jar between
 * tests.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

import { POST as trainerSignup } from "@/app/api/auth/trainer/signup/route";
import { POST as trainerLogin } from "@/app/api/auth/trainer/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as customerLogin } from "@/app/api/auth/customer/login/route";
import { middleware } from "@/middleware";

import {
  CUSTOMER_COOKIE,
  TRAINER_COOKIE,
  signSession,
} from "@/server/auth/jwt";
import type { ApiError, CustomerDTO, TrainerDTO } from "@/shared/types";

import {
  prisma,
  createTrainer,
  createGroup,
  createCustomer,
  clearAuth,
  getCookie,
  getCookieOptions,
  callRoute,
} from "../helpers";

const SIGNUP_URL = "http://t.local/api/auth/trainer/signup";
const LOGIN_URL = "http://t.local/api/auth/trainer/login";
const LOGOUT_URL = "http://t.local/api/auth/logout";
const CUSTOMER_LOGIN = (slug: string): string =>
  `http://t.local/api/auth/customer/login?slug=${encodeURIComponent(slug)}`;

function secret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET missing in .env.test");
  return s;
}

beforeEach(() => {
  // Defensive: the jar is also reset in setup.ts afterEach, but a fresh start
  // here keeps each test self-contained even if run in isolation.
  clearAuth();
});

describe("trainer signup", () => {
  it("returns 201, sets the trainer cookie, and persists a trainer (no passwordHash leaked)", async () => {
    const email = "alice@demo.test";
    const { status, body } = await callRoute<TrainerDTO & { passwordHash?: unknown }>(
      trainerSignup,
      { method: "POST", url: SIGNUP_URL, body: { email, password: "password123", name: "Alice Coach" } },
    );

    expect(status).toBe(201);
    expect(body.email).toBe(email);
    expect(body.id).toBeTruthy();
    expect(body.slug).toBeTruthy();
    // DTO must never expose the hash.
    expect(body.passwordHash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("passwordHash");

    const cookie = getCookie(TRAINER_COOKIE);
    expect(cookie).toBeTruthy();
    // A JWT has three dot-separated segments.
    expect((cookie ?? "").split(".")).toHaveLength(3);
    // Session cookie must be httpOnly (rule 6).
    expect(getCookieOptions(TRAINER_COOKIE)?.httpOnly).toBe(true);

    const row = await prisma.trainer.findUnique({ where: { email } });
    expect(row).not.toBeNull();
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe("password123");
  });

  it("rejects a duplicate email with 409", async () => {
    const email = "dupe@demo.test";
    const first = await callRoute(trainerSignup, {
      method: "POST",
      url: SIGNUP_URL,
      body: { email, password: "password123", name: "First" },
    });
    expect(first.status).toBe(201);

    const second = await callRoute<ApiError>(trainerSignup, {
      method: "POST",
      url: SIGNUP_URL,
      body: { email, password: "password123", name: "Second" },
    });
    expect(second.status).toBe(409);
    expect(second.body.code).toBe("CONFLICT");
  });

  it("rejects a weak (<8 char) password with 400", async () => {
    const { status, body } = await callRoute<ApiError>(trainerSignup, {
      method: "POST",
      url: SIGNUP_URL,
      body: { email: "weak@demo.test", password: "short", name: "Weak" },
    });
    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");

    const row = await prisma.trainer.findUnique({ where: { email: "weak@demo.test" } });
    expect(row).toBeNull();
  });
});

describe("slug generation", () => {
  it("gives two trainers with names that slugify identically DISTINCT slugs", async () => {
    const a = await callRoute<TrainerDTO>(trainerSignup, {
      method: "POST",
      url: SIGNUP_URL,
      body: { email: "jd1@demo.test", password: "password123", name: "John Doe" },
    });
    clearAuth();
    const b = await callRoute<TrainerDTO>(trainerSignup, {
      method: "POST",
      url: SIGNUP_URL,
      body: { email: "jd2@demo.test", password: "password123", name: "John  Doe" },
    });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.slug).toBeTruthy();
    expect(b.body.slug).toBeTruthy();
    expect(a.body.slug).not.toBe(b.body.slug);

    // Both must actually be unique in the DB.
    const slugs = await prisma.trainer.findMany({ select: { slug: true } });
    const set = new Set(slugs.map((s) => s.slug));
    expect(set.size).toBe(slugs.length);
  });

  it("produces a non-empty fallback slug for a non-ASCII-only name", async () => {
    const { status, body } = await callRoute<TrainerDTO>(trainerSignup, {
      method: "POST",
      url: SIGNUP_URL,
      body: { email: "korean@demo.test", password: "password123", name: "김철수" },
    });
    expect(status).toBe(201);
    expect(body.slug).toBeTruthy();
    expect(body.slug.length).toBeGreaterThan(0);
    // The fallback uses [a-z0-9] only (slugify strips non-ASCII, then a random token).
    expect(body.slug).toMatch(/^[a-z0-9-]+$/);
  });
});

describe("trainer login", () => {
  it("returns the SAME generic error for wrong password and unknown email", async () => {
    await createTrainer({ email: "known@demo.test", password: "rightpass1" });

    const wrongPw = await callRoute<ApiError>(trainerLogin, {
      method: "POST",
      url: LOGIN_URL,
      body: { email: "known@demo.test", password: "wrongpass1" },
    });
    clearAuth();
    const unknownEmail = await callRoute<ApiError>(trainerLogin, {
      method: "POST",
      url: LOGIN_URL,
      body: { email: "nobody@demo.test", password: "rightpass1" },
    });

    expect(wrongPw.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical status AND message — no field-existence leak.
    expect(wrongPw.status).toBe(unknownEmail.status);
    expect(wrongPw.body.message).toBe(unknownEmail.body.message);
    // The generic message must not name a specific field as the cause.
    expect(wrongPw.body.message.toLowerCase()).not.toMatch(/no such|not found|does not exist/);

    // No cookie set on a failed login.
    expect(getCookie(TRAINER_COOKIE)).toBeFalsy();
  });

  it("returns 200 + sets the cookie for correct credentials", async () => {
    await createTrainer({ email: "good@demo.test", password: "rightpass1" });

    const { status, body, res } = await callRoute<TrainerDTO>(trainerLogin, {
      method: "POST",
      url: LOGIN_URL,
      body: { email: "good@demo.test", password: "rightpass1" },
    });
    void res;

    expect(status).toBe(200);
    expect(body.email).toBe("good@demo.test");
    const cookie = getCookie(TRAINER_COOKIE);
    expect(cookie).toBeTruthy();
    expect((cookie ?? "").split(".")).toHaveLength(3);
  });
});

describe("customer login", () => {
  async function seedTrainerWithCustomer(
    slug: string,
    emailPrefix: string,
  ): Promise<void> {
    const trainer = await createTrainer({ slug, email: `${emailPrefix}@demo.test` });
    const group = await createGroup(trainer.id);
    await createCustomer(trainer.id, group.id, {
      name: "Jane Doe",
      password: "janepass1",
    });
  }

  it("matches a normalized name (mixed case + surrounding spaces) under the correct slug", async () => {
    await seedTrainerWithCustomer("a", "trainera");

    const { status, body } = await callRoute<CustomerDTO>(customerLogin, {
      method: "POST",
      url: CUSTOMER_LOGIN("a"),
      body: { name: "  jane doe ", password: "janepass1" },
    });

    expect(status).toBe(200);
    expect(body.name).toBe("Jane Doe");
    const cookie = getCookie(CUSTOMER_COOKIE);
    expect(cookie).toBeTruthy();
    expect((cookie ?? "").split(".")).toHaveLength(3);
  });

  it("does NOT authenticate the same name+password under a different trainer's slug (no IDOR)", async () => {
    await seedTrainerWithCustomer("a", "trainera");
    // Trainer B exists (slug `b`) but has no such customer.
    const trainerB = await createTrainer({ slug: "b", email: "trainerb@demo.test" });
    await createGroup(trainerB.id);

    const { status, body } = await callRoute<ApiError>(customerLogin, {
      method: "POST",
      url: CUSTOMER_LOGIN("b"),
      body: { name: "Jane Doe", password: "janepass1" },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
    expect(getCookie(CUSTOMER_COOKIE)).toBeFalsy();
  });

  it("returns 401 generic for an unknown slug", async () => {
    await seedTrainerWithCustomer("a", "trainera");

    const { status, body } = await callRoute<ApiError>(customerLogin, {
      method: "POST",
      url: CUSTOMER_LOGIN("does-not-exist"),
      body: { name: "Jane Doe", password: "janepass1" },
    });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
    expect(getCookie(CUSTOMER_COOKIE)).toBeFalsy();
  });

  it("returns 401 generic for a wrong password under the correct slug", async () => {
    await seedTrainerWithCustomer("a", "trainera");

    const { status } = await callRoute<ApiError>(customerLogin, {
      method: "POST",
      url: CUSTOMER_LOGIN("a"),
      body: { name: "Jane Doe", password: "wrongpass1" },
    });

    expect(status).toBe(401);
    expect(getCookie(CUSTOMER_COOKIE)).toBeFalsy();
  });
});

describe("logout", () => {
  it("clears both session cookies and is idempotent", async () => {
    // Sign in as a trainer first so a cookie is present.
    await createTrainer({ email: "out@demo.test", password: "rightpass1" });
    await callRoute(trainerLogin, {
      method: "POST",
      url: LOGIN_URL,
      body: { email: "out@demo.test", password: "rightpass1" },
    });
    expect(getCookie(TRAINER_COOKIE)).toBeTruthy();

    const first = await callRoute<{ ok: boolean }>(logout, {
      method: "POST",
      url: LOGOUT_URL,
    });
    expect(first.status).toBe(200);
    // clearSessionCookie sets value to "" — getCookie returns "" or undefined.
    expect(getCookie(TRAINER_COOKIE)).toBeFalsy();
    expect(getCookie(CUSTOMER_COOKIE)).toBeFalsy();

    // Idempotent: a second call still succeeds.
    const second = await callRoute<{ ok: boolean }>(logout, {
      method: "POST",
      url: LOGOUT_URL,
    });
    expect(second.status).toBe(200);
    expect(getCookie(TRAINER_COOKIE)).toBeFalsy();
    expect(getCookie(CUSTOMER_COOKIE)).toBeFalsy();
  });
});

describe("middleware guards", () => {
  function locationOf(res: Response): string {
    return res.headers.get("location") ?? "";
  }

  it("redirects a logged-out /dashboard request to /login (307)", async () => {
    const req = new NextRequest(new URL("http://localhost/dashboard"));
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(locationOf(res)).toMatch(/\/login$/);
  });

  it("redirects a logged-out /portal/<slug>/dashboard request to that portal's login", async () => {
    const req = new NextRequest(new URL("http://localhost/portal/acme/dashboard"));
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(locationOf(res)).toMatch(/\/portal\/acme\/login$/);
  });

  it("redirects (not 500) when the trainer token is tampered", async () => {
    const token = await signSession({ trainerId: "t-123" }, secret());
    // Corrupt the payload segment so the HMAC signature no longer matches. A
    // single-char flip in the *signature* segment can occasionally still verify
    // (base64url rounding), so mutate the payload, which always invalidates it.
    const [header, payload, sig] = token.split(".");
    const flip = payload.slice(-1) === "A" ? "B" : "A";
    const tampered = `${header}.${payload.slice(0, -1)}${flip}.${sig}`;

    const req = new NextRequest(new URL("http://localhost/dashboard"));
    req.cookies.set(TRAINER_COOKIE, tampered);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.status).not.toBe(500);
    expect(locationOf(res)).toMatch(/\/login$/);
  });

  it("redirects when the trainer token is expired", async () => {
    const expired = await signSession({ trainerId: "t-123" }, secret(), {
      expiresIn: "0s",
    });

    const req = new NextRequest(new URL("http://localhost/dashboard"));
    req.cookies.set(TRAINER_COOKIE, expired);
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(locationOf(res)).toMatch(/\/login$/);
  });

  it("passes through a valid trainer cookie on /dashboard", async () => {
    const token = await signSession({ trainerId: "t-123" }, secret());

    const req = new NextRequest(new URL("http://localhost/dashboard"));
    req.cookies.set(TRAINER_COOKIE, token);
    const res = await middleware(req);

    // NextResponse.next(): no redirect, no location header.
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not guard unmatched paths (passes through)", async () => {
    const req = new NextRequest(new URL("http://localhost/login"));
    const res = await middleware(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
