import { NextResponse } from "next/server";

import { createGroupSchema } from "@/server/api/_schemas/groups";
import { getTrainerSession } from "@/server/auth/session";
import { prisma } from "@/server/data/prisma";
import {
  createGroup,
  listGroups,
  type GroupWithCustomers,
} from "@/server/domain/groups";
import { AuthError, NotFoundError, toApiError, ValidationError } from "@/server/lib/errors";
import type { CustomerDTO, GroupDTO } from "@/shared/types";

type GroupWithCustomersDTO = GroupDTO & { customers: CustomerDTO[] };

function toGroupDTO(group: {
  id: string;
  name: string;
  note: string | null;
  createdAt: Date;
}): GroupDTO {
  return {
    id: group.id,
    name: group.name,
    note: group.note,
    createdAt: group.createdAt.toISOString(),
  };
}

function toCustomerDTO(customer: {
  id: string;
  name: string;
  groupId: string;
  createdAt: Date;
}): CustomerDTO {
  return {
    id: customer.id,
    name: customer.name,
    groupId: customer.groupId,
    createdAt: customer.createdAt.toISOString(),
  };
}

function toGroupWithCustomersDTO(group: GroupWithCustomers): GroupWithCustomersDTO {
  return {
    ...toGroupDTO(group),
    customers: group.customers.map(toCustomerDTO),
  };
}

/** GET /api/groups — the session trainer's groups (each with its customers). */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const trainer = await prisma.trainer.findUnique({
      where: { id: session.trainerId },
      select: { slug: true },
    });
    if (!trainer) {
      throw new NotFoundError("Trainer not found.");
    }

    const groups = await listGroups(session.trainerId);

    return NextResponse.json(
      {
        trainerSlug: trainer.slug,
        groups: groups.map(toGroupWithCustomersDTO),
      },
      { status: 200 },
    );
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}

/** POST /api/groups — create a group under the session trainer. */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const parsed = createGroupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid group details.");
    }

    const group = await createGroup(session.trainerId, parsed.data);

    return NextResponse.json(toGroupDTO(group), { status: 201 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
