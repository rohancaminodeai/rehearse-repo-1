/**
 * Task 4.3 — HEIC convert unit tests (TEST lane).
 *
 * Locks the HEIC detection + conversion path (CLAUDE.md rule 8: HEIC→JPEG on
 * upload). `isHeic` is also covered by heic.test.ts; here we focus on the actual
 * `heicToJpeg` conversion against the real `sample.heic` fixture and on its
 * failure mode (unconvertible bytes → ValidationError, never stored).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import { heicToJpeg, isHeic } from "@/server/lib/heic";
import { ValidationError } from "@/server/lib/errors";

// Resolve from the project root (Vitest runs with cwd at the repo root).
const fixture = (name: string): Buffer =>
  readFileSync(resolve(process.cwd(), "test/fixtures", name));

/** JPEG files begin with the SOI marker FF D8 FF. */
function isJpeg(buf: Buffer): boolean {
  return buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
}

describe("isHeic", () => {
  it("is true for HEIC/HEIF content types", () => {
    expect(isHeic({ contentType: "image/heic" })).toBe(true);
    expect(isHeic({ contentType: "image/heif" })).toBe(true);
  });

  it("is true for .heic/.heif filenames (case-insensitive)", () => {
    expect(isHeic({ filename: "scan.HEIC" })).toBe(true);
    expect(isHeic({ filename: "scan.heif" })).toBe(true);
  });

  it("is false for jpeg/png", () => {
    expect(isHeic({ contentType: "image/jpeg" })).toBe(false);
    expect(isHeic({ contentType: "image/png" })).toBe(false);
    expect(isHeic({ filename: "scan.jpg" })).toBe(false);
    expect(isHeic({ filename: "scan.png" })).toBe(false);
  });
});

describe("heicToJpeg", () => {
  it("converts a real HEIC buffer to a JPEG buffer (FF D8 FF magic bytes)", async () => {
    const out = await heicToJpeg(fixture("sample.heic"));
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.length).toBeGreaterThan(0);
    expect(isJpeg(out)).toBe(true);
  });

  it("rejects non-HEIC garbage bytes with a ValidationError (never stored)", async () => {
    const garbage = Buffer.from("this is definitely not a heic file");
    await expect(heicToJpeg(garbage)).rejects.toBeInstanceOf(ValidationError);
  });
});
