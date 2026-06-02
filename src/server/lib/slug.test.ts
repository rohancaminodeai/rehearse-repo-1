import { describe, it, expect } from "vitest";

import { slugify, uniqueSlug, normalizeName } from "@/server/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("John Doe")).toBe("john-doe");
  });

  it("strips punctuation", () => {
    expect(slugify("John, Doe!")).toBe("john-doe");
  });

  it("collapses repeated separators", () => {
    expect(slugify("John   --  Doe")).toBe("john-doe");
  });

  it("returns empty string for non-ASCII input", () => {
    expect(slugify("홍길동")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(slugify("   ")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns the plain slug when nothing collides", async () => {
    const exists = async (): Promise<boolean> => false;
    expect(await uniqueSlug("John Doe", exists)).toBe("john-doe");
  });

  it("returns a different suffixed slug when the first candidate collides", async () => {
    const taken = new Set<string>(["john-doe"]);
    const exists = async (slug: string): Promise<boolean> => taken.has(slug);

    const result = await uniqueSlug("John Doe", exists);
    expect(result).not.toBe("john-doe");
    expect(result.startsWith("john-doe-")).toBe(true);
  });
});

describe("normalizeName", () => {
  it("trims and lowercases", () => {
    expect(normalizeName("  Jane DOE ")).toBe("jane doe");
  });

  it("handles mixed case", () => {
    expect(normalizeName("JaNe")).toBe("jane");
  });
});
