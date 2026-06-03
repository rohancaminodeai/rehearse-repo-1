import { NextResponse } from "next/server";

import { patchCustomerSchema } from "@/server/api/_schemas/customers";
import { getTrainerSession } from "@/server/auth/session";
import { deleteCustomer, updateCustomer } from "@/server/domain/customers";
import { AuthError, toApiError, ValidationError } from "@/server/lib/errors";
import type { CustomerDTO } from "@/shared/types";
import type { Customer } from "@prisma/client";

type RouteContext = { params: Promise<{ id: string }> };

function toCustomerDTO(customer: Customer): CustomerDTO {
  return {
    id: customer.id,
    name: customer.name,
    groupId: customer.groupId,
    createdAt: customer.createdAt.toISOString(),
  };
}

/** PATCH /api/customers/[id] — rename, reset password, or move group. */
export async function PATCH(req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const { id } = await ctx.params;

    const parsed = patchCustomerSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid customer details.");
    }

    const customer = await updateCustomer(session.trainerId, id, parsed.data);

    return NextResponse.json(toCustomerDTO(customer), { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}

/** DELETE /api/customers/[id] — cascade delete + best-effort MinIO cleanup. */
export async function DELETE(_req: Request, ctx: RouteContext): Promise<NextResponse> {
  try {
    const session = await getTrainerSession();
    if (!session) {
      throw new AuthError();
    }

    const { id } = await ctx.params;

    await deleteCustomer(session.trainerId, id);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
