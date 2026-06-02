import { z } from "zod";

// Add a customer into a group (FR-7): a customer cannot exist without a group.
export const createCustomerSchema = z.object({
  groupId: z.string().min(1),
  name: z.string().min(1),
  password: z.string().min(4),
});

// Edit a customer (FR-9): rename, reset password, or move group. All fields optional.
export const patchCustomerSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(4).optional(),
  groupId: z.string().min(1).optional(),
});
