import { NextResponse } from "next/server";

import { createCustomerSchema } from "@/server/api/_schemas/customers";
import { getTrainerSession } from "@/server/auth/session";
import { createCustomer } from "@/server/domain/customers";
import { AuthError, toApiError, ValidationError } from "@/server/lib/errors";
import type { CustomerDTO } from "@/shared/types";
import type { Customer } from "@prisma/client";

function toCustomerDTO(customer: Customer): CustomerDTO {
  return {
    id: customer.id,
    name: customer.name,
    groupId: customer.groupId,
    createdAt: customer.createdAt.toISOString(),
  };
}

/** POST /api/customers — create a customer in one of the trainer's groups. */
export async function POST(req: Request): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const parsed = createCustomerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid customer details.");
    }

    const customer = await createCustomer(session.trainerId, parsed.data);

    return NextResponse.json(toCustomerDTO(customer), { status: 201 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
