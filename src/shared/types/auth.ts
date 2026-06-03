import type { z } from "zod";
import type {
  trainerSignupSchema,
  trainerLoginSchema,
  customerLoginSchema,
} from "@/server/api/_schemas/auth";

// Request inputs (inferred from the Zod boundary schemas).
export type TrainerSignupInput = z.infer<typeof trainerSignupSchema>;
export type TrainerLoginInput = z.infer<typeof trainerLoginSchema>;
export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

// Response DTO — never includes passwordHash.
export interface TrainerDTO {
  id: string;
  email: string;
  name: string;
  slug: string;
  createdAt: string;
}
