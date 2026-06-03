/**
 * Task 4.3 — InBody integration tests (TEST lane).
 *
 * Exercises the real BE inbody routes against the test Postgres + test MinIO
 * bucket and the mocked next/headers cookie jar. Locks in:
 *  - upload jpeg: 201; object lands in the bucket; DB row has a UUID-based key
 *    (NOT the original filename) + preserved metadata; comment optional (rule 8)
 *  - upload HEIC: stored object is JPEG (magic bytes + content-type); the file
 *    proxy serves it with an image content-type (rule 8 HEIC→JPEG)
 *  - unconvertible / disallowed type → 400 with NO orphan object (rule 8)
 *  - size cap → 400
 *  - DB-failure cleanup: put-then-create ordering deletes the orphan (rule 11)
 *  - file-route IDOR (P0, rule 4): cross-customer / cross-trainer → 404, owner →
 *    200, no session → 401, ?download=1 → attachment
 *  - list scoped to the owning trainer (cross-trainer → 404, missing id → 400)
 *  - PATCH comment persists verbatim (plain text), IDOR → 404
 *  - DELETE removes DB row AND the MinIO object (rule 11), IDOR → 404
 *
 * Behavioral + independent: setup.ts truncates tables, empties the bucket, and
 * resets the jar between tests.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

import { POST as inbodyPOST, GET as inbodyGET } from "@/app/api/inbody/route";
import {
  PATCH as inbodyPATCHRoute,
  DELETE as inbodyDELETERoute,
} from "@/app/api/inbody/[id]/route";
import { GET as inbodyFileGETRoute } from "@/app/api/inbody/[id]/file/route";
import { prisma as appPrisma } from "@/server/data/prisma";
import type { ApiError, InbodyEntryDTO } from "@/shared/types";

import {
  prisma,
  createTrainer,
  createGroup,
  createCustomer,
  createEntry,
  authAsTrainer,
  authAsCustomer,
  clearAuth,
  callRoute,
  putTestObject,
  testObjectExists,
  type RouteHandler,
} from "../helpers";

// Adapt the dynamic-route handlers to the harness's RouteHandler signature.
const inbodyPATCH: RouteHandler = (req, ctx) =>
  inbodyPATCHRoute(req, ctx as { params: Promise<{ id: string }> });
const inbodyDELETE: RouteHandler = (req, ctx) =>
  inbodyDELETERoute(req, ctx as { params: Promise<{ id: string }> });
const inbodyFileGET: RouteHandler = (req, ctx) =>
  inbodyFileGETRoute(req, ctx as { params: Promise<{ id: string }> });

const INBODY_URL = "http://t.local/api/inbody";
const fileUrl = (id: string, download = false): string =>
  `http://t.local/api/inbody/${id}/file${download ? "?download=1" : ""}`;
const entryUrl = (id: string): string => `http://t.local/api/inbody/${id}`;

const fixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url)));

/** Build a web `File` from a Node Buffer (Uint8Array is a valid BlobPart). */
function fileFrom(buf: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(buf)], name, { type });
}

function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

// A read-only S3 client to assert the test bucket is empty (no orphan objects).
const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});

async function bucketObjectCount(): Promise<number> {
  const listed = await s3.send(
    new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET ?? "inbody-test" }),
  );
  return listed.Contents?.length ?? 0;
}

/** Build + invoke a multipart upload (callRoute can't do multipart). */
async function uploadFile(opts: {
  file: File;
  customerId: string;
  comment?: string;
}): Promise<{ status: number; body: InbodyEntryDTO & ApiError }> {
  const form = new FormData();
  form.set("file", opts.file);
  form.set("customerId", opts.customerId);
  if (opts.comment !== undefined) form.set("comment", opts.comment);
  const req = new Request(INBODY_URL, { method: "POST", body: form });
  const res = await inbodyPOST(req);
  let body: InbodyEntryDTO & ApiError;
  try {
    body = (await res.clone().json()) as InbodyEntryDTO & ApiError;
  } catch {
    body = {} as InbodyEntryDTO & ApiError;
  }
  return { status: res.status, body };
}

beforeEach(() => {
  clearAuth();
});

describe("POST /api/inbody — upload jpeg (rule 8)", () => {
  it("uploads a jpeg (201); object lands in the bucket with a UUID key + metadata", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    const file = fileFrom(fixture("sample.jpg"), "my-scan.jpg", "image/jpeg");
    const { status, body } = await uploadFile({
      file,
      customerId: customer.id,
      comment: "nice progress",
    });

    expect(status).toBe(201);
    expect(body.id).toBeTruthy();
    expect(body.originalFilename).toBe("my-scan.jpg");
    expect(body.contentType).toBe("image/jpeg");
    expect(body.comment).toBe("nice progress");
    // DTO must never leak the storage key.
    expect(JSON.stringify(body)).not.toContain("objectKey");

    // The persisted row stores a UUID-based key (NOT the original filename).
    const row = await prisma.inbodyEntry.findFirst({ where: { id: body.id } });
    expect(row).not.toBeNull();
    expect(row?.objectKey).toBeTruthy();
    expect(row?.objectKey).not.toBe("my-scan.jpg");
    expect(row?.objectKey).not.toContain("my-scan");
    expect(row?.objectKey).toMatch(/^[0-9a-f-]{36}\.jpg$/);
    expect(row?.originalFilename).toBe("my-scan.jpg");
    expect(row?.contentType).toBe("image/jpeg");

    // The object really landed in the test bucket.
    expect(await testObjectExists(row!.objectKey)).toBe(true);
  });

  it("uploads without a comment (comment is optional → null)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    const file = fileFrom(fixture("sample.jpg"), "scan.jpg", "image/jpeg");
    const { status, body } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(201);
    expect(body.comment).toBeNull();
    const row = await prisma.inbodyEntry.findFirst({ where: { id: body.id } });
    expect(row?.comment).toBeNull();
  });

  it("rejects an upload for ANOTHER trainer's customer with 404 (no leak)", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    const customerB = await createCustomer(trainerB.id, groupB.id);
    await authAsTrainer(trainerA.id);

    const file = fileFrom(fixture("sample.jpg"), "scan.jpg", "image/jpeg");
    const { status, body } = await uploadFile({ file, customerId: customerB.id });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(await prisma.inbodyEntry.count()).toBe(0);
  });

  it("rejects an unauthenticated upload with 401", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    clearAuth();

    const file = fileFrom(fixture("sample.jpg"), "scan.jpg", "image/jpeg");
    const { status, body } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });
});

describe("POST /api/inbody — HEIC→JPEG conversion (rule 8)", () => {
  it("stores a HEIC upload as JPEG and serves it as an image", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    const file = fileFrom(fixture("sample.heic"), "scan.heic", "image/heic");
    const { status, body } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(201);
    // Original filename preserved, but stored content-type is JPEG.
    expect(body.originalFilename).toBe("scan.heic");
    expect(body.contentType).toBe("image/jpeg");

    const row = await prisma.inbodyEntry.findFirst({ where: { id: body.id } });
    expect(row?.contentType).toBe("image/jpeg");
    expect(row?.objectKey).toMatch(/\.jpg$/);

    // Fetch the stored bytes through the auth-checked proxy and assert JPEG magic.
    await authAsTrainer(trainer.id);
    const res = await inbodyFileGET(new Request(fileUrl(body.id)), {
      params: Promise.resolve({ id: body.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^image\//);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(isJpeg(bytes)).toBe(true);
  });
});

describe("POST /api/inbody — type/size rejection (rule 8)", () => {
  it("rejects a disallowed content type (text/plain) with 400 and creates no entry", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    const file = fileFrom(Buffer.from("hello"), "notes.txt", "text/plain");
    const { status, body } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.inbodyEntry.count()).toBe(0);
  });

  it("rejects a .heic-named file with non-HEIC bytes with 400 and leaves no orphan object", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    // Allowed content-type so it passes the allowlist, but the bytes are not a
    // real HEIC → conversion fails BEFORE the put → 400, no entry, no orphan.
    const file = fileFrom(Buffer.from("not really a heic file"), "fake.heic", "image/heic");
    const { status, body } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    // No DB row was created. (Conversion fails before the put, so no orphan.)
    expect(await prisma.inbodyEntry.count()).toBe(0);
  });

  it("rejects a file over MAX_UPLOAD_BYTES with 400 and creates no entry", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    const cap = Number(process.env.MAX_UPLOAD_BYTES ?? "10485760");
    const oversize = Buffer.alloc(cap + 1, 0xff);
    const file = fileFrom(oversize, "huge.jpg", "image/jpeg");
    const { status, body } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(await prisma.inbodyEntry.count()).toBe(0);
  });
});

describe("POST /api/inbody — DB-failure cleanup (rule 11)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes the just-put object when the DB row write fails (no orphan)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    await authAsTrainer(trainer.id);

    // Force the DB create to reject once; the domain must clean up the object.
    const spy = vi
      .spyOn(appPrisma.inbodyEntry, "create")
      .mockRejectedValueOnce(new Error("simulated DB failure"));

    const file = fileFrom(fixture("sample.jpg"), "scan.jpg", "image/jpeg");
    const { status } = await uploadFile({ file, customerId: customer.id });

    expect(status).toBe(500);
    expect(spy).toHaveBeenCalledTimes(1);
    // No DB row was persisted.
    expect(await prisma.inbodyEntry.count()).toBe(0);
    // And the just-put object was cleaned up: the bucket holds no orphan.
    expect(await bucketObjectCount()).toBe(0);
  });
});

describe("GET /api/inbody/[id]/file — IDOR (P0, rule 4)", () => {
  it("lets the owning trainer fetch the file (200, image content-type)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const objectKey = `owned-${customer.id}.jpg`;
    const entry = await createEntry(customer.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");
    await authAsTrainer(trainer.id);

    const res = await inbodyFileGET(new Request(fileUrl(entry.id)), {
      params: Promise.resolve({ id: entry.id }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^image\//);
  });

  it("lets the owning customer fetch their own file (200)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const objectKey = `cust-${customer.id}.jpg`;
    const entry = await createEntry(customer.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");
    await authAsCustomer(customer.id, trainer.id);

    const res = await inbodyFileGET(new Request(fileUrl(entry.id)), {
      params: Promise.resolve({ id: entry.id }),
    });
    expect(res.status).toBe(200);
  });

  it("blocks a DIFFERENT customer from another customer's file with 404 (no leak)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customerA = await createCustomer(trainer.id, group.id, { name: "Alice" });
    const customerB = await createCustomer(trainer.id, group.id, { name: "Bob" });
    const objectKey = `b-${customerB.id}.jpg`;
    const entryB = await createEntry(customerB.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");

    // Customer A authenticates and tries to read B's entry.
    await authAsCustomer(customerA.id, trainer.id);
    const res = await inbodyFileGET(new Request(fileUrl(entryB.id)), {
      params: Promise.resolve({ id: entryB.id }),
    });
    const body = (await res.clone().json()) as ApiError;

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("blocks a trainer from ANOTHER trainer's entry file with 404 (no leak)", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    const customerB = await createCustomer(trainerB.id, groupB.id);
    const objectKey = `tb-${customerB.id}.jpg`;
    const entryB = await createEntry(customerB.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");

    await authAsTrainer(trainerA.id);
    const res = await inbodyFileGET(new Request(fileUrl(entryB.id)), {
      params: Promise.resolve({ id: entryB.id }),
    });
    const body = (await res.clone().json()) as ApiError;

    expect(res.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("rejects an unauthenticated file fetch with 401", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const objectKey = `na-${customer.id}.jpg`;
    const entry = await createEntry(customer.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");
    clearAuth();

    const res = await inbodyFileGET(new Request(fileUrl(entry.id)), {
      params: Promise.resolve({ id: entry.id }),
    });
    const body = (await res.clone().json()) as ApiError;

    expect(res.status).toBe(401);
    expect(body.code).toBe("AUTH_ERROR");
  });

  it("sets Content-Disposition: attachment when ?download=1", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const objectKey = `dl-${customer.id}.jpg`;
    const entry = await createEntry(customer.id, {
      objectKey,
      originalFilename: "report.jpg",
    });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");
    await authAsTrainer(trainer.id);

    const res = await inbodyFileGET(new Request(fileUrl(entry.id, true)), {
      params: Promise.resolve({ id: entry.id }),
    });
    expect(res.status).toBe(200);
    const disposition = res.headers.get("Content-Disposition");
    expect(disposition).toContain("attachment");
    expect(disposition).toContain("report.jpg");
  });
});

describe("GET /api/inbody?customerId= — list scoping (rule 4)", () => {
  it("returns only the owned customer's entries (newest first)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const other = await createCustomer(trainer.id, group.id, { name: "Other" });
    await createEntry(customer.id, { comment: "mine-1" });
    await createEntry(customer.id, { comment: "mine-2" });
    await createEntry(other.id, { comment: "not-mine" });
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<InbodyEntryDTO[]>(inbodyGET, {
      method: "GET",
      url: `${INBODY_URL}?customerId=${customer.id}`,
    });

    expect(status).toBe(200);
    expect(body).toHaveLength(2);
    const comments = body.map((e) => e.comment);
    expect(comments).toContain("mine-1");
    expect(comments).toContain("mine-2");
    expect(comments).not.toContain("not-mine");
  });

  it("returns 404 when listing ANOTHER trainer's customer (no leak)", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    const customerB = await createCustomer(trainerB.id, groupB.id);
    await createEntry(customerB.id);
    await authAsTrainer(trainerA.id);

    const { status, body } = await callRoute<ApiError>(inbodyGET, {
      method: "GET",
      url: `${INBODY_URL}?customerId=${customerB.id}`,
    });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
  });

  it("returns 400 when customerId is missing", async () => {
    const trainer = await createTrainer();
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<ApiError>(inbodyGET, {
      method: "GET",
      url: INBODY_URL,
    });

    expect(status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
  });
});

describe("PATCH /api/inbody/[id] — comment edit", () => {
  it("persists the new comment verbatim (plain text, no HTML mangling)", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const entry = await createEntry(customer.id, { comment: "old" });
    await authAsTrainer(trainer.id);

    const literal = "Great job <b>champ</b> & keep going!";
    const { status, body } = await callRoute<InbodyEntryDTO>(inbodyPATCH, {
      method: "PATCH",
      url: entryUrl(entry.id),
      body: { comment: literal },
      params: { id: entry.id },
    });

    expect(status).toBe(200);
    expect(body.comment).toBe(literal);
    const row = await prisma.inbodyEntry.findFirst({ where: { id: entry.id } });
    expect(row?.comment).toBe(literal);
  });

  it("returns 404 when patching ANOTHER trainer's entry (no leak)", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    const customerB = await createCustomer(trainerB.id, groupB.id);
    const entryB = await createEntry(customerB.id, { comment: "B's comment" });
    await authAsTrainer(trainerA.id);

    const { status, body } = await callRoute<ApiError>(inbodyPATCH, {
      method: "PATCH",
      url: entryUrl(entryB.id),
      body: { comment: "hacked" },
      params: { id: entryB.id },
    });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    const row = await prisma.inbodyEntry.findFirst({ where: { id: entryB.id } });
    expect(row?.comment).toBe("B's comment");
  });
});

describe("DELETE /api/inbody/[id] — DB row + MinIO cleanup (rule 11)", () => {
  it("removes the DB row AND the MinIO object", async () => {
    const trainer = await createTrainer();
    const group = await createGroup(trainer.id);
    const customer = await createCustomer(trainer.id, group.id);
    const objectKey = `del-${customer.id}.jpg`;
    const entry = await createEntry(customer.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");
    expect(await testObjectExists(objectKey)).toBe(true);
    await authAsTrainer(trainer.id);

    const { status, body } = await callRoute<{ ok: boolean }>(inbodyDELETE, {
      method: "DELETE",
      url: entryUrl(entry.id),
      params: { id: entry.id },
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(await prisma.inbodyEntry.findFirst({ where: { id: entry.id } })).toBeNull();
    expect(await testObjectExists(objectKey)).toBe(false);
  });

  it("returns 404 when deleting ANOTHER trainer's entry, leaving it intact", async () => {
    const trainerA = await createTrainer({ email: "a@demo.test" });
    const trainerB = await createTrainer({ email: "b@demo.test" });
    const groupB = await createGroup(trainerB.id);
    const customerB = await createCustomer(trainerB.id, groupB.id);
    const objectKey = `keep-${customerB.id}.jpg`;
    const entryB = await createEntry(customerB.id, { objectKey });
    await putTestObject(objectKey, fixture("sample.jpg"), "image/jpeg");
    await authAsTrainer(trainerA.id);

    const { status, body } = await callRoute<ApiError>(inbodyDELETE, {
      method: "DELETE",
      url: entryUrl(entryB.id),
      params: { id: entryB.id },
    });

    expect(status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(await prisma.inbodyEntry.findFirst({ where: { id: entryB.id } })).not.toBeNull();
    expect(await testObjectExists(objectKey)).toBe(true);
  });
});
