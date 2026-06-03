import { z } from "zod";

// Allowlist of emoji a customer may react with (FR-14).
export const REACTION_EMOJIS = ["👍", "❤️", "🔥", "💪", "🎉", "😮"] as const;

// Set the single reaction on an entry (FR-14).
export const setReactionSchema = z.object({
  emoji: z.enum(REACTION_EMOJIS),
});
