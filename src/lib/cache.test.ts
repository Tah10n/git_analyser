import { describe, expect, it } from "vitest";
import { createHistoryCacheKey } from "./cache";

describe("createHistoryCacheKey", () => {
  it("keeps repository, branch, history mode, and limit distinct", () => {
    expect(
      createHistoryCacheKey("Acme/Tool", 20, "feature/graph", "recent"),
    ).toBe("v3::Acme/Tool::feature/graph::recent::20");
  });

  it("keeps case-sensitive refs and analyzer URLs distinct", () => {
    expect(createHistoryCacheKey("acme/tool", 20, "Release", "recent"))
      .not.toBe(createHistoryCacheKey("acme/tool", 20, "release", "recent"));
    expect(createHistoryCacheKey("service:https://host/Api:acme/tool", 20, "main", "recent"))
      .not.toBe(createHistoryCacheKey("service:https://host/api:acme/tool", 20, "main", "recent"));
  });
});
