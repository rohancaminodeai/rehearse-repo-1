import { describe, it, expect } from "vitest";

import { decideReaction } from "@/server/domain/reaction-toggle";

describe("decideReaction", () => {
  it("adds when there is no current reaction", () => {
    expect(decideReaction(null, "👍")).toEqual({ action: "add" });
  });

  it("removes when the incoming emoji matches the current one", () => {
    expect(decideReaction("👍", "👍")).toEqual({ action: "remove" });
  });

  it("replaces when the incoming emoji differs from the current one", () => {
    expect(decideReaction("👍", "❤️")).toEqual({ action: "replace" });
  });
});
