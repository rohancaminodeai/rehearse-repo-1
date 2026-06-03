import { NextResponse } from "next/server";

import { patchCommentSchema } from "@/server/api/_schemas/inbody";
import { getTrainerSession } from "@/server/auth/session";
import {
  deleteEntry,
  patchComment,
  type InbodyEntryWithReaction,
} from "@/server/domain/inbody";
import { AuthError, toApiError, ValidationError } from "@/server/lib/errors";
import type { InbodyEntryDTO } from "@/shared/types";

type RouteContext = { params: Promise<{ id: string }> };

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

/** PATCH /api/inbody/[id] — edit an owned entry's comment. */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const { id } = await ctx.params;

    const parsed = patchCommentSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid comment.");
    }

    const entry = await patchComment(session.trainerId, id, parsed.data.comment);

    return NextResponse.json(toInbodyEntryDTO(entry), { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/inbody/[id] — delete an owned entry (DB row + best-effort MinIO). */
export async function DELETE(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const { id } = await ctx.params;

    await deleteEntry(session.trainerId, id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
