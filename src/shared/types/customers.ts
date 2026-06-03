import type { z } from "zod";
import type {
  createCustomerSchema,
  patchCustomerSchema,
} from "@/server/api/_schemas/customers";

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type PatchCustomerInput = z.infer<typeof patchCustomerSchema>;

// Response DTO — never includes passwordHash or nameNormalized.
export interface CustomerDTO {
  id: string;
  name: string;
  groupId: string;
  createdAt: string;
}
