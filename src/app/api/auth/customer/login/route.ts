import { NextResponse } from "next/server";

import { customerLoginSchema } from "@/server/api/_schemas/auth";
import { CUSTOMER_COOKIE, signSession } from "@/server/auth/jwt";
import { setSessionCookie } from "@/server/auth/session";
import { loginCustomer } from "@/server/domain/auth";
import { env } from "@/server/lib/env";
import { toApiError, ValidationError } from "@/server/lib/errors";
import type { CustomerDTO } from "@/shared/types";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // Contract: `customerLoginSchema` is `{ name, password }` (no slug). The
    // trainer slug is read from the query string instead.
    const slug = new URL(req.url).searchParams.get("slug");

    const parsed = customerLoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid login details.");
    }

    const customer = await loginCustomer(slug, parsed.data.name, parsed.data.password);

    const token = await signSession(
      { customerId: customer.id, trainerId: customer.trainerId },
      env.JWT_SECRET,
    );
    await setSessionCookie(CUSTOMER_COOKIE, token);

    const dto: CustomerDTO = {
      id: customer.id,
      name: customer.name,
      groupId: customer.groupId,
      createdAt: customer.createdAt.toISOString(),
    };
    return NextResponse.json(dto, { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
