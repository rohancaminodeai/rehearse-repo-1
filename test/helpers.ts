/**
 * Integration test helpers: a shared Prisma client, row factories, auth-cookie
 * seeding (via the mocked cookie jar), and a route-handler caller.
 *
 * Usage (node/integration project only — relies on the next/headers mock in
 * test/setup.ts):
 *
 *   const trainer = await createTrainer();
 *   await authAsTrainer(trainer.id);
 *   const res = await callRoute(POST, { method: "POST", url: "http://t/api/...", body });
 */
import { PrismaClient } from "@prisma/client";
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { hashPassword } from "@/server/lib/password";
import { normalizeName } from "@/server/lib/slug";
import {
  CUSTOMER_COOKIE,
  TRAINER_COOKIE,
  signSession,
} from "@/server/auth/jwt";
import { cookieJar } from "./cookies";

export const prisma = new PrismaClient();

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing in .env.test");
  return secret;
}

let counter = 0;
const uniq = (prefix: string): string => `${prefix}-${Date.now()}-${counter++}`;

export async function createTrainer(
  overrides: Partial<{ email: string; name: string; slug: string; password: string }> = {},
) {
  const password = overrides.password ?? "password123";
  return prisma.trainer.create({
    data: {
      email: overrides.email ?? `${uniq("coach")}@demo.test`,
      name: overrides.name ?? "Test Coach",
      slug: overrides.slug ?? uniq("coach"),
      passwordHash: await hashPassword(password),
    },
  });
}

export async function createGroup(
  trainerId: string,
  overrides: Partial<{ name: string; note: string | null }> = {},
) {
  return prisma.group.create({
    data: {
      trainerId,
      name: overrides.name ?? "Test Group",
      note: overrides.note ?? null,
    },
  });
}

export async function createCustomer(
  trainerId: string,
  groupId: string,
  overrides: Partial<{ name: string; password: string }> = {},
) {
  const name = overrides.name ?? "Test Customer";
  const password = overrides.password ?? "test1234";
  return prisma.customer.create({
    data: {
      trainerId,
      groupId,
      name,
      nameNormalized: normalizeName(name),
      passwordHash: await hashPassword(password),
    },
  });
}

export async function createEntry(
  customerId: string,
  overrides: Partial<{ objectKey: string; originalFilename: string; contentType: string; comment: string | null }> = {},
) {
  return prisma.inbodyEntry.create({
    data: {
      customerId,
      objectKey: overrides.objectKey ?? uniq("obj") + ".jpg",
      originalFilename: overrides.originalFilename ?? "scan.jpg",
      contentType: overrides.contentType ?? "image/jpeg",
      comment: overrides.comment ?? null,
    },
  });
}

/** Seed a trainer session cookie into the mocked jar. */
export async function authAsTrainer(trainerId: string): Promise<void> {
  cookieJar.set(TRAINER_COOKIE, await signSession({ trainerId }, jwtSecret()));
}

/** Seed a customer session cookie (bound to its trainer) into the mocked jar. */
export async function authAsCustomer(customerId: string, trainerId: string): Promise<void> {
  cookieJar.set(CUSTOMER_COOKIE, await signSession({ customerId, trainerId }, jwtSecret()));
}

export function clearAuth(): void {
  cookieJar.delete(TRAINER_COOKIE);
  cookieJar.delete(CUSTOMER_COOKIE);
}

/** Read a cookie value the handler set on the mocked jar (or undefined). */
export function getCookie(name: string): string | undefined {
  return cookieJar.get(name)?.value;
}

/** Read the options a handler passed when setting a cookie (httpOnly/secure/...). */
export function getCookieOptions(name: string) {
  return cookieJar.getOptions(name);
}

// --- MinIO / S3 test helpers (test bucket) ------------------------------------

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

function testBucket(): string {
  return process.env.S3_BUCKET ?? "inbody-test";
}

/** Put a small object directly into the test bucket. */
export async function putTestObject(
  key: string,
  body: Buffer | string = "test",
  contentType = "image/jpeg",
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: testBucket(),
      Key: key,
      Body: typeof body === "string" ? Buffer.from(body) : body,
      ContentType: contentType,
    }),
  );
}

/** True if the object exists in the test bucket. */
export async function testObjectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: testBucket(), Key: key }));
    return true;
  } catch {
    return false;
  }
}

export type RouteHandler = (req: Request, ctx?: unknown) => Promise<Response> | Response;

export interface CallOptions {
  method?: string;
  url?: string;
  body?: unknown;
  /** Dynamic route params; passed to the handler as `{ params: Promise<...> }`. */
  params?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface CallResult<T = unknown> {
  status: number;
  body: T;
  res: Response;
}

/** Invoke an App Router route handler with a constructed Request. */
export async function callRoute<T = unknown>(
  handler: RouteHandler,
  opts: CallOptions = {},
): Promise<CallResult<T>> {
  const method = opts.method ?? "GET";
  const url = opts.url ?? "http://test.local/";
  const init: RequestInit = {
    method,
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
  };
  if (opts.body !== undefined) init.body = JSON.stringify(opts.body);

  const req = new Request(url, init);
  const ctx = opts.params ? { params: Promise.resolve(opts.params) } : undefined;
  const res = await handler(req, ctx);
  let body: T;
  try {
    body = (await res.clone().json()) as T;
  } catch {
    body = undefined as T;
  }
  return { status: res.status, body, res };
}
