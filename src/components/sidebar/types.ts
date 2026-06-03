import type { CustomerDTO, GroupDTO } from "@/shared/types";

/**
 * Agreed FE↔BE shape for `GET /api/groups` (not in shared/types). A group with
 * its nested customers, plus the trainer's portal slug for portal-link copy.
 */
export type GroupWithCustomers = GroupDTO & { customers: CustomerDTO[] };

export interface SidebarData {
  trainerSlug: string;
  groups: GroupWithCustomers[];
}
