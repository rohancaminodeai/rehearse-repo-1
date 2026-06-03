import { NextResponse } from "next/server";

import { trainerSignupSchema } from "@/server/api/_schemas/auth";
import { signSession, TRAINER_COOKIE } from "@/server/auth/jwt";
import { setSessionCookie } from "@/server/auth/session";
import { signupTrainer } from "@/server/domain/auth";
import { env } from "@/server/lib/env";
import { toApiError, ValidationError } from "@/server/lib/errors";
import type { TrainerDTO } from "@/shared/types";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const parsed = trainerSignupSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      throw new ValidationError("Invalid sign-up details.");
    }

    const trainer = await signupTrainer(parsed.data);

    const token = await signSession({ trainerId: trainer.id }, env.JWT_SECRET);
    await setSessionCookie(TRAINER_COOKIE, token);

    const dto: TrainerDTO = {
      id: trainer.id,
      email: trainer.email,
      name: trainer.name,
      slug: trainer.slug,
      createdAt: trainer.createdAt.toISOString(),
    };
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    const { status, body } = toApiError(err);
    return NextResponse.json(body, { status });
  }
}
