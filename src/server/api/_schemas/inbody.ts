import { z } from "zod";

// Metadata for an upload (FR-10/FR-11). The file itself is multipart and validated in the handler.
export const uploadMetaSchema = z.object({
  customerId: z.string().min(1),
  comment: z.string().optional(),
});

// Edit an entry's comment (FR-12).
export const patchCommentSchema = z.object({
  comment: z.string(),
});
