import type { z } from "zod";
import type { createGroupSchema } from "@/server/api/_schemas/groups";

export type CreateGroupInput = z.infer<typeof createGroupSchema>;

export interface GroupDTO {
  id: string;
  name: string;
  note: string | null;
  createdAt: string;
}
