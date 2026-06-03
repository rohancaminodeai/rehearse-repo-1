import { describe, it, expect } from "vitest";

import { hashPassword, verifyPassword } from "@/server/lib/password";

describe("password", () => {
  it("produces a hash that differs from the plaintext", async () => {
    const plain = "correct horse battery staple";
    const hash = await hashPassword(plain);
    expect(hash).not.toBe(plain);
  });

  it("produces distinct hashes for the same password (salted)", async () => {
    const plain = "correct horse battery staple";
    const a = await hashPassword(plain);
    const b = await hashPassword(plain);
    expect(a).not.toBe(b);
  });

  it("emits a bcrypt hash (starts with $2)", async () => {
    const hash = await hashPassword("anything");
    expect(hash.startsWith("$2")).toBe(true);
  });

  it("verifies the correct password as true", async () => {
    const plain = "s3cret-pass";
    const hash = await hashPassword(plain);
    expect(await verifyPassword(plain, hash)).toBe(true);
  });

  it("verifies a wrong password as false", async () => {
    const hash = await hashPassword("s3cret-pass");
    expect(await verifyPassword("wrong-pass", hash)).toBe(false);
  });
});
