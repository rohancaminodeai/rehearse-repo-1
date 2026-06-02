import { NextResponse } from "next/server";

import { trainerLoginSchema } from "@/server/api/_schemas/auth";
import { signSession, TRAINER_COOKIE } from "@/server/auth/jwt";
import { setSessionCookie } from "@/server/auth/session";
import { loginTrainer } from "@/server/domain/auth";
import { env } from "@/server/lib/env";
import { toApiError, ValidationError } from "@/server/lib/errors";
import type { TrainerDTO } from "@/shared/types";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const parsed = trainerLoginSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid login details.");
    }

    const trainer = await loginTrainer(parsed.data);

    const token = await signSession({ trainerId: trainer.id }, env.JWT_SECRET);
    await setSessionCookie(TRAINER_COOKIE, token);

    const dto: TrainerDTO = {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      slug: trainer.slug,
      createdAt: trainer.createdAt.toISOString(),
    };
    return NextResponse.json(dto, { status: 200 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
