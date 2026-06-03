import { NextResponse } from "next/server";

import { setReactionSchema } from "@/server/api/_schemas/reaction";
import { getCustomerSession } from "@/server/auth/session";
import { setReaction } from "@/server/domain/reactions";
import { AuthError, toApiError, ValidationError } from "@/server/lib/errors";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * PUT /api/inbody/[id]/reaction — customer-only emoji upsert/toggle.
 *
 * Requiring a customer session enforces customer-only access (a trainer with no
 * customer cookie → 401). The body is the resulting ReactionDTO, or `null` when
 * the reaction was toggled off (same emoji). Single-reaction model (rule 2): no
 * separate DELETE route — toggle-off via PUT same-emoji clears it.
 */
export async function PUT(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const session = await getCustomerSession();
    if (!session) {
      throw new AuthError();
    }

    const { id } = await ctx.params;

    const parsed = setReactionSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid emoji.");
    }

    const reaction = await setReaction(session.customerId, id, parsed.data.emoji);

    return NextResponse.json(reaction, { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
