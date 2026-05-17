import { describe, expect, it } from "vitest";
import { commits } from "../data/history";
import { getBranchScopedCommits, getPreservedCommitIndex } from "./branches";

describe("branch commit helpers", () => {
  it("scopes demo commits by selected branch membership", () => {
    const main = getBranchScopedCommits(commits, "main");
    const feature = getBranchScopedCommits(commits, "feature/graph");

    expect(main.map((commit) => commit.shortHash)).toContain("d55e903");
    expect(feature.map((commit) => commit.shortHash)).toEqual([
      "8b19c2a",
      "12f6ad4",
      "fe40712",
      "b6f3129",
    ]);
  });

  it("preserves the selected commit when it still exists on the target branch", () => {
    const feature = getBranchScopedCommits(commits, "feature/graph");

    expect(
      getPreservedCommitIndex(
        feature,
        "b6f31294f0d85e23c0d27d2c9eab3d6b21f8a782",
      ),
    ).toBe(3);
    expect(getPreservedCommitIndex(feature, "missing")).toBe(-1);
  });
});
