import type { Reaction } from "@prisma/client";

import { prisma } from "@/server/data/prisma";
import { NotFoundError } from "@/server/lib/errors";
import { decideReaction } from "@/server/domain/reaction-toggle";
import type { ReactionDTO } from "@/shared/types";

/**
 * Reaction domain — plain functions (CLAUDE.md rule 3).
 *
 * Imports nothing framework-specific; the route handler reads the customer
 * session cookie, validates the emoji against the frozen allowlist, and maps the
 * result to HTTP. Every query is scoped to the calling customer (rule 4): a
 * customer may only react on their OWN entry. A not-owned/absent entry surfaces
 * as 404 so we never leak existence. One reaction per entry, always.
 */

/** Map a Prisma Reaction row to its response DTO. */
function toReactionDTO(reaction: Reaction): ReactionDTO {
  return {
    id: reaction.id,
    emoji: reaction.emoji,
    createdAt: reaction.createdAt.toISOString(),
  };
}

/**
 * Set/toggle the single reaction on an entry the customer owns.
 *
 * The entry is resolved scoped to `customerId` (the P0 ownership check); a
 * not-owned/absent entry → NotFoundError(404). The pure {@link decideReaction}
 * helper decides add/replace/remove given the current emoji and the incoming one:
 *  - add     → create the reaction, return its DTO.
 *  - replace → update the reaction's emoji, return its DTO.
 *  - remove  → delete the reaction (same emoji toggles off), return null.
 */
export async function setReaction(
  customerId: string,
  entryId: string,
  emoji: string,
): Promise<ReactionDTO | null> {
  const entry = await prisma.inbodyEntry.findFirst({
    where: { id: entryId, customerId },
    include: { reaction: true },
  });
  if (!entry) {
    throw new NotFoundError("Entry not found.");
  }

  const decision = decideReaction(entry.reaction?.emoji ?? null, emoji);

  switch (decision.action) {
    case "add": {
      const reaction = await prisma.reaction.create({
        data: { inbodyEntryId: entryId, emoji },
      });
      return toReactionDTO(reaction);
    }
    case "replace": {
      const reaction = await prisma.reaction.update({
        where: { inbodyEntryId: entryId },
        data: { emoji },
      });
      return toReactionDTO(reaction);
    }
    case "remove": {
      await prisma.reaction.delete({ where: { inbodyEntryId: entryId } });
      return null;
    }
  }
}
