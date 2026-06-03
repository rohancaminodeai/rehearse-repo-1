import { NextResponse } from "next/server";

import { uploadMetaSchema } from "@/server/api/_schemas/inbody";
import { getTrainerSession } from "@/server/auth/session";
import {
  listEntries,
  uploadEntry,
  type InbodyEntryWithReaction,
} from "@/server/domain/inbody";
import { AuthError, toApiError, ValidationError } from "@/server/lib/errors";
import type { InbodyEntryDTO } from "@/shared/types";

/** Map a domain entry (+ joined reaction) to the response DTO (metadata only). */
function toInbodyEntryDTO(entry: InbodyEntryWithReaction): InbodyEntryDTO {
  return {
    id: entry.id,
    originalFilename: entry.originalFilename,
    contentType: entry.contentType,
    comment: entry.comment,
    createdAt: entry.createdAt.toISOString(),
    reaction: entry.reaction
      ? {
          id: entry.reaction.id,
          emoji: entry.reaction.emoji,
          createdAt: entry.reaction.createdAt.toISOString(),
        }
      : null,
  };
}

/**
 * POST /api/inbody — upload an InBody image (multipart `file` + `customerId` +
 * optional `comment`) for one of the trainer's customers.
 */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ValidationError("A file is required.");
    }

    const comment = form.get("comment");
    const parsed = uploadMetaSchema.safeParse({
      customerId: form.get("customerId"),
      comment: typeof comment === "string" ? comment : undefined,
    });
    if (!parsed.success) {
      throw new ValidationError("Invalid upload details.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const entry = await uploadEntry(session.trainerId, {
      customerId: parsed.data.customerId,
      comment: parsed.data.comment,
      buffer,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    });

    return NextResponse.json(toInbodyEntryDTO(entry), { status: 201 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}

/** GET /api/inbody?customerId= — list an owned customer's entries (newest first). */
export async function GET(req: Request): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const customerId = new URL(req.url).searchParams.get("customerId");
    if (!customerId) {
      throw new ValidationError("customerId is required.");
    }

    const entries = await listEntries(session.trainerId, customerId);

    return NextResponse.json(entries.map(toInbodyEntryDTO), { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
