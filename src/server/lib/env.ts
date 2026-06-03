/**
 * Startup environment validation (CLAUDE.md rule 14).
 *
 * Parsed eagerly so the app refuses to boot when a required variable is
 * missing or malformed. The sign/verify *core* in `auth/session` takes the
 * secret as an argument (Edge-safe, unit-testable) and does not import this
 * module; only server route handlers / lib that genuinely need config do.
 */
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(10_485_760),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = loadEnv();
