import { describe, expect, it } from "vitest";
import { createHistoryCacheKey } from "./cache";

describe("createHistoryCacheKey", () => {
  it("keeps repository, branch, history mode, and limit distinct", () => {
    expect(
      createHistoryCacheKey("Acme/Tool", 20, "feature/graph", "recent"),
    ).toBe("acme/tool::feature/graph::recent::20");
  });
});
