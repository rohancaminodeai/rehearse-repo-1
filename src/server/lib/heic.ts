import convert from "heic-convert";

import { ValidationError } from "@/server/lib/errors";

/**
 * Detect HEIC/HEIF input by content type or filename extension. Returns false
 * for jpeg/png/webp.
 */
export function isHeic(input: { contentType?: string; filename?: string }): boolean {
  const ct = input.contentType?.toLowerCase();
  if (ct === "image/heic" || ct === "image/heif") return true;

  const name = input.filename?.toLowerCase() ?? "";
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/** Convert a HEIC/HEIF buffer to JPEG. Throws ValidationError on failure (→ 400). */
export async function heicToJpeg(buffer: Buffer): Promise<Buffer> {
  try {
    // heic-convert / heic-decode require an iterable typed array at runtime
    // (it spreads `buffer.slice(...)`); a raw ArrayBuffer throws. The published
    // @types mistype this as ArrayBufferLike — corrected in src/types/heic-convert.d.ts.
    const output = await convert({
      buffer: new Uint8Array(buffer),
      format: "JPEG",
      quality: 0.9,
    });
    return Buffer.from(output);
  } catch {
    throw new ValidationError("Could not process the image file.");
  }
}
