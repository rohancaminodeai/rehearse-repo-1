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
    const view = new Uint8Array(buffer);
    const output = await convert({
      buffer: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
      format: "JPEG",
      quality: 0.9,
    });
    return Buffer.from(output);
  } catch {
    throw new ValidationError("Could not process the image file.");
  }
}
