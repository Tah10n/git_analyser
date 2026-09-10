import { describe, expect, it } from "vitest";
import { commits as demoCommits } from "../data/history";
import type { CommitGraph, ExplorerCommit } from "../types";
import { createGraphModel } from "./GitGrowthGraph";

const commit = (id: string, parents: string[]): ExplorerCommit => ({
  ...demoCommits[0],
  id,
  parents,
  parentShas: parents,
});

describe("createGraphModel parent relationships", () => {
  const commits = [
    commit("left", ["outside-left"]),
    commit("right", ["outside-right"]),
    commit("orphan", []),
    commit("merge", ["left", "right", "outside-merge"]),
  ];
  const graph: CommitGraph = {
    nodes: commits.map(({ id }) => id),
    edges: commits.flatMap(({ id, parents }) =>
      parents.map((parent) => ({ from: id, to: parent })),
    ),
    heads: ["merge", "orphan"],
    roots: ["orphan"],
    merges: ["merge"],
  };

  it.each([
    ["commit metadata", undefined],
    ["service graph", graph],
  ] as const)("preserves disconnected boundaries and merge parents from %s", (_, source) => {
    const model = createGraphModel(commits, source);

    expect(model.edges).toEqual([
      { child: 3, parent: 0 },
      { child: 3, parent: 1 },
    ]);
    expect(model.parents).toEqual([[], [], [], [0, 1]]);
  });

  it("respects an explicitly empty service graph", () => {
    const model = createGraphModel(commits, { ...graph, edges: [] });
    expect(model.edges).toEqual([]);
    expect(model.parents).toEqual([[], [], [], []]);
  });
});
