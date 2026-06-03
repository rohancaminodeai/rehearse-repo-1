import type { z } from "zod";
import type { setReactionSchema } from "@/server/api/_schemas/reaction";

export type SetReactionInput = z.infer<typeof setReactionSchema>;

export interface ReactionDTO {
  id: string;
  emoji: string;
  createdAt: string;
}
