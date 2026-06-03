import crypto from "node:crypto";

import type { InbodyEntry, Reaction } from "@prisma/client";

import { prisma } from "@/server/data/prisma";
import { env } from "@/server/lib/env";
import { AuthError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { heicToJpeg, isHeic } from "@/server/lib/heic";
import { deleteObject, putObject } from "@/server/lib/s3";
import type { CustomerSession, TrainerSession } from "@/server/auth/jwt";

/**
 * InBody domain — plain functions (CLAUDE.md rule 3).
 *
 * Imports nothing framework-specific (no `next/*`, no `Request`); the route
 * handlers parse multipart/JSON, read session cookies, and map to HTTP. Every
 * query is scoped by ownership (rule 4): a trainer may only touch entries that
 * belong to one of their customers; a customer may only touch their own entries.
 * A resource that is not owned surfaces as a 404 — we never leak existence.
 */

/** InbodyEntry with its (optional) reaction joined in. */
export type InbodyEntryWithReaction = InbodyEntry & { reaction: Reaction | null };

/** Content types we accept for upload. HEIC/HEIF are converted to JPEG first. */
const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);

/** Map a stored/converted content type to a file extension for the object key. */
function extensionFor(contentType: string): string {
  if (contentType === "image/png") return ".png";
  // jpeg (and the HEIC→JPEG output) → .jpg
  return ".jpg";
}

/** Confirm the trainer owns the customer, or throw 404. */
async function assertOwnsCustomer(trainerId: string, customerId: string): Promise<void> {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, trainerId },
    select: { id: true },
  });
  if (!customer) {
    throw new NotFoundError("Customer not found.");
  }
}

/**
 * Upload an InBody image for one of the trainer's customers.
 *
 * Steps: (1) ownership check, (2) content-type allowlist, (3) size cap,
 * (4) HEIC→JPEG conversion when needed, (5) UUID-based object key (rule 8 —
 * never the raw filename), (6) put-to-MinIO BEFORE the DB row; if the DB write
 * fails, delete the just-uploaded object best-effort so no orphan is left.
 */
export async function uploadEntry(
  trainerId: string,
  input: {
    customerId: string;
    comment?: string;
    buffer: Buffer;
    filename: string;
    contentType: string;
    size: number;
  },
): Promise<InbodyEntryWithReaction> {
  await assertOwnsCustomer(trainerId, input.customerId);

  if (!ALLOWED_CONTENT_TYPES.has(input.contentType)) {
    throw new ValidationError("Unsupported file type.");
  }

  if (input.size > env.MAX_UPLOAD_BYTES) {
    throw new ValidationError("File is too large.");
  }

  let finalBuffer: Buffer;
  let finalContentType: string;
  if (isHeic({ contentType: input.contentType, filename: input.filename })) {
    finalBuffer = await heicToJpeg(input.buffer);
    finalContentType = "image/jpeg";
  } else {
    finalBuffer = input.buffer;
    finalContentType = input.contentType;
  }

  const objectKey = `${crypto.randomUUID()}${extensionFor(finalContentType)}`;

  // Order matters (rule 8): object first, DB row second. If the DB write throws,
  // remove the orphaned object (best-effort) before rethrowing.
  await putObject(objectKey, finalBuffer, finalContentType);

  try {
    return await prisma.inbodyEntry.create({
      data: {
        customerId: input.customerId,
        objectKey,
        originalFilename: input.filename,
        contentType: finalContentType,
        comment: input.comment ?? null,
      },
      include: { reaction: true },
    });
  } catch (err) {
    try {
      await deleteObject(objectKey);
    } catch (cleanupErr) {
      // Best-effort: the DB write already failed; a failed cleanup must not mask
      // the original error. Log and continue.
      console.error(`Failed to clean up orphaned object ${objectKey}:`, cleanupErr);
    }
    throw err;
  }
}

/**
 * List a customer's entries (newest first), with each entry's reaction joined.
 * Ownership of the customer is enforced (404 if not owned).
 */
export async function listEntries(
  trainerId: string,
  customerId: string,
): Promise<InbodyEntryWithReaction[]> {
  await assertOwnsCustomer(trainerId, customerId);

  return prisma.inbodyEntry.findMany({
    where: { customerId },
    include: { reaction: true },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Edit an entry's comment. The entry is resolved through its customer's
 * `trainerId` so a trainer can only edit comments on their own entries; a
 * not-owned/absent entry surfaces as 404.
 */
export async function patchComment(
  trainerId: string,
  entryId: string,
  comment: string,
): Promise<InbodyEntryWithReaction> {
  const entry = await prisma.inbodyEntry.findFirst({
    where: { id: entryId, customer: { trainerId } },
    select: { id: true },
  });
  if (!entry) {
    throw new NotFoundError("Entry not found.");
  }

  return prisma.inbodyEntry.update({
    where: { id: entryId },
    data: { comment },
    include: { reaction: true },
  });
}

/**
 * Delete an owned entry: remove the DB row first, then best-effort delete the
 * MinIO object. A failed object delete must NOT fail the request (rule 11) —
 * Prisma cascade does not touch MinIO, so we clean up here.
 */
export async function deleteEntry(trainerId: string, entryId: string): Promise<void> {
  const entry = await prisma.inbodyEntry.findFirst({
    where: { id: entryId, customer: { trainerId } },
    select: { id: true, objectKey: true },
  });
  if (!entry) {
    throw new NotFoundError("Entry not found.");
  }

  await prisma.inbodyEntry.delete({ where: { id: entryId } });

  try {
    await deleteObject(entry.objectKey);
  } catch (err) {
    console.error(`Failed to delete MinIO object ${entry.objectKey}:`, err);
  }
}

/**
 * Resolve an entry for the auth-checked file proxy (the P0 IDOR surface).
 *
 * Role-aware authorization:
 *  - trainer session → entry must belong to one of the trainer's customers.
 *  - customer session → entry must belong to that exact customer (the customer
 *    cookie is bound to a single `customerId`; rule 5).
 *  - no session → AuthError.
 *
 * A mismatch resolves to NotFoundError(404) so we never leak that the entry
 * exists for someone else.
 */
export async function getEntryForViewer(
  sessions: {
    trainerSession: TrainerSession | null;
    customerSession: CustomerSession | null;
  },
  entryId: string,
): Promise<{ objectKey: string; contentType: string; originalFilename: string }> {
  const { trainerSession, customerSession } = sessions;

  let entry: { objectKey: string; contentType: string; originalFilename: string } | null;

  if (trainerSession) {
    entry = await prisma.inbodyEntry.findFirst({
      where: { id: entryId, customer: { trainerId: trainerSession.trainerId } },
      select: { objectKey: true, contentType: true, originalFilename: true },
    });
  } else if (customerSession) {
    entry = await prisma.inbodyEntry.findFirst({
      where: { id: entryId, customerId: customerSession.customerId },
      select: { objectKey: true, contentType: true, originalFilename: true },
    });
  } else {
    throw new AuthError();
  }

  if (!entry) {
    throw new NotFoundError("Entry not found.");
  }
  return entry;
}
