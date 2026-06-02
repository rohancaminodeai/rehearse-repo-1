// @vitest-environment node
// jose's runtime instanceof checks require Node's native TextEncoder/Uint8Array;
// jsdom substitutes its own, so this pure-crypto suite runs in the node environment.
import { describe, it, expect } from "vitest";

import { signSession, verifySession } from "@/server/auth/session";

const SECRET = "test-secret-test-secret-test-secret-32";
const OTHER_SECRET = "other-secret-other-secret-other-32xx!";

interface Payload {
  trainerId: string;
}

describe("session sign/verify", () => {
  it("round-trips the payload fields", async () => {
    const token = await signSession({ trainerId: "t1" }, SECRET);
    const payload = await verifySession<Payload>(token, SECRET);
    expect(payload.trainerId).toBe("t1");
  });

  it("rejects a tampered token", async () => {
    const token = await signSession({ trainerId: "t1" }, SECRET);
    // Mutate a character in the signature segment.
    const lastChar = token.slice(-1);
    const swapped = lastChar === "a" ? "b" : "a";
    const tampered = token.slice(0, -1) + swapped;
    await expect(verifySession<Payload>(tampered, SECRET)).rejects.toThrow();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession({ trainerId: "t1" }, SECRET);
    await expect(verifySession<Payload>(token, OTHER_SECRET)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await signSession({ trainerId: "t1" }, SECRET, { expiresIn: "0s" });
    await expect(verifySession<Payload>(token, SECRET)).rejects.toThrow();
  });
});
