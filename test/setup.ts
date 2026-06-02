/**
 * Integration test setup (node project only).
 *
 * - Loads `.env.test` so DB/MinIO point at the test containers.
 * - Applies the Prisma schema to the test database once before the suite.
 * - Truncates all tables and empties the test bucket between tests so each
 *   integration test starts from a clean slate.
 *
 * This file only runs when integration test files exist; in Phase 1 (unit
 * tests only) it is never loaded.
 */
import { execSync } from "node:child_process";
import { config as loadEnv } from "dotenv";
import { afterEach, beforeAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

loadEnv({ path: ".env.test" });

const prisma = new PrismaClient();

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY ?? "",
    secretAccessKey: process.env.S3_SECRET_KEY ?? "",
  },
});
const bucket = process.env.S3_BUCKET ?? "inbody-test";

beforeAll(() => {
  // Push the schema to the (ephemeral) test database. `db push` is faster than
  // running the full migration history and is appropriate for a throwaway DB.
  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    stdio: "inherit",
    env: process.env,
  });
});

async function emptyBucket(): Promise<void> {
  const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
  if (!listed.Contents?.length) return;
  await s3.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key! })) },
    }),
  );
}

afterEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "Reaction","InbodyEntry","Customer","Group","Trainer" RESTART IDENTITY CASCADE',
  );
  await emptyBucket().catch(() => {
    /* best-effort: bucket may not exist yet in some suites */
  });
});
