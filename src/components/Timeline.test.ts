import { describe, expect, it } from "vitest";
import { getCommitGraphNodeRoles, getMarkerPositionPercent } from "./Timeline";
import type { ExplorerCommit } from "../types";

const commit = (
  id: string,
  parents: string[] = [],
  branch = "main",
): ExplorerCommit => ({
  id,
  fullSha: id,
  shortHash: id.slice(0, 7),
  title: id,
  message: id,
  author: "Ada",
  date: "2026-01-01T00:00:00Z",
  branch,
  parentShas: parents,
  parents,
  refs: [],
  branches: [branch],
  changes: [],
  snapshot: [],
});

describe("getMarkerPositionPercent", () => {
  it("keeps a single-commit timeline marker in bounds", () => {
    expect(getMarkerPositionPercent(0, 1)).toBe("0%");
  });

  it("spreads multi-commit markers across the full timeline", () => {
    expect(getMarkerPositionPercent(0, 3)).toBe("0%");
    expect(getMarkerPositionPercent(1, 3)).toBe("50%");
    expect(getMarkerPositionPercent(2, 3)).toBe("100%");
  });
});

describe("getCommitGraphNodeRoles", () => {
  it("keeps old cached commits without parents on a linear graph", () => {
    const roles = getCommitGraphNodeRoles([
      commit("first"),
      commit("second"),
    ]);

    expect(roles[0].className).toContain("is-root");
    expect(roles[0].childCount).toBe(1);
    expect(roles[1].className).not.toContain("is-root");
    expect(roles[1].className).toContain("is-head");
    expect(roles[1].parentCount).toBe(1);
  });

  it("labels service graph roots, heads, and merges", () => {
    const roles = getCommitGraphNodeRoles(
      [
        commit("root"),
        commit("left", ["root"]),
        commit("merge", ["left", "right"]),
      ],
      {
        edges: [
          { from: "left", to: "root" },
          { from: "merge", to: "left" },
          { from: "merge", to: "right" },
        ],
        heads: ["merge"],
        merges: ["merge"],
        nodes: ["root", "left", "right", "merge"],
        roots: ["root", "right"],
      },
    );

    expect(roles[0].className).toContain("is-root");
    expect(roles[1].childCount).toBe(1);
    expect(roles[2].className).toContain("is-merge");
    expect(roles[2].className).toContain("is-head");
    expect(roles[2].parentCount).toBe(2);
  });
});
