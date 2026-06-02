import { z } from "zod";

// Create a group (FR-6): name + optional note.
export const createGroupSchema = z.object({
  name: z.string().min(1),
  note: z.string().optional(),
});
