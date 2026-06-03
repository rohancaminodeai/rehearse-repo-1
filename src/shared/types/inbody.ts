import type { z } from "zod";
import type {
  uploadMetaSchema,
  patchCommentSchema,
} from "@/server/api/_schemas/inbody";
import type { ReactionDTO } from "@/shared/types/reaction";

export type UploadMetaInput = z.infer<typeof uploadMetaSchema>;
export type PatchCommentInput = z.infer<typeof patchCommentSchema>;

// Response DTO — exposes metadata only; the image bytes are served via the auth-checked file proxy.
export interface InbodyEntryDTO {
  id: string;
  originalFilename: string;
  contentType: string;
  comment: string | null;
  createdAt: string;
  reaction: ReactionDTO | null;
}
