import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "@/server/lib/env";

/**
 * S3 client for MinIO. `forcePathStyle: true` is required for MinIO
 * (bucket in the path, not the host). Endpoint + credentials come from env.
 */
const s3 = new S3Client({
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

const BUCKET = env.S3_BUCKET;

/** Upload an object under `key`. */
export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Fetch an object as a stream plus its stored content type. */
export async function getObjectStream(key: string): Promise<{
  body: ReadableStream | NodeJS.ReadableStream;
  contentType?: string;
}> {
  const out = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
  const body = out.Body as ReadableStream | NodeJS.ReadableStream | undefined;
  if (!body) {
    throw new Error(`Object has no body: ${key}`);
  }
  return { body, contentType: out.ContentType };
}

/** Delete an object (best-effort callers may ignore failures). */
export async function deleteObject(key: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
}

/**
 * Ensure the configured bucket exists. Best-effort: HeadBucket, and on any
 * failure attempt CreateBucket, swallowing already-exists errors so a fresh
 * `docker compose up` never 500s.
 */
export async function ensureBucket(): Promise<void> {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return;
  } catch {
    // Bucket likely missing; try to create it below.
  }
  try {
    await s3.send(new CreateBucketCommand({ Bucket: BUCKET }));
  } catch {
    // Already exists / race / concurrent create — best-effort, ignore.
  }
}
