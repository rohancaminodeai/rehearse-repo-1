import { describe, it, expect } from "vitest";

import { isHeic } from "@/server/lib/heic";

describe("isHeic", () => {
  it("detects HEIC/HEIF content types", () => {
    expect(isHeic({ contentType: "image/heic" })).toBe(true);
    expect(isHeic({ contentType: "image/heif" })).toBe(true);
  });

  it("detects HEIC/HEIF filename extensions (case-insensitive)", () => {
    expect(isHeic({ filename: "scan.HEIC" })).toBe(true);
    expect(isHeic({ filename: "x.heif" })).toBe(true);
  });

  it("returns false for non-HEIC content types", () => {
    expect(isHeic({ contentType: "image/jpeg" })).toBe(false);
  });

  it("returns false for non-HEIC filename extensions", () => {
    expect(isHeic({ filename: "x.png" })).toBe(false);
    expect(isHeic({ filename: "x.webp" })).toBe(false);
  });

  it("returns false for empty input", () => {
    expect(isHeic({})).toBe(false);
  });
});
