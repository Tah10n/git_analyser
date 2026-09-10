import { describe, expect, it } from "vitest";
import { commits as demoCommits } from "../data/history";
import type { CommitGraph, ExplorerCommit } from "../types";
import { createGraphModel, projectGraphNodes } from "./GitGrowthGraph";

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

  it("separates side histories even when every commit has the selected branch label", () => {
    const history = [commit("root", []), commit("side", ["root"]),
      commit("main", ["root"]), commit("merge", ["main", "side"])];
    const model = createGraphModel(history);
    expect(model.nodes[1].y).not.toBe(model.nodes[2].y);
    expect(model.nodes[0].y).toBe(model.nodes[2].y);
    expect(model.nodes[2].y).toBe(model.nodes[3].y);
    expect(model.edges).toHaveLength(4);
  });

  it("does not depend on commits being sorted by ancestry", () => {
    const model = createGraphModel([commit("child", ["root"]), commit("root", [])]);
    expect(model.nodes[0].y).toBe(model.nodes[1].y);
  });

  it("reuses a side lane after each sequential merge", () => {
    const history = [commit("root", [])];
    let tip = "root";
    for (let index = 1; index <= 6; index++) {
      history.push(commit(`side${index}`, [tip]), commit(`merge${index}`, [tip, `side${index}`]));
      tip = `merge${index}`;
    }
    const model = createGraphModel(history);
    expect(new Set(model.nodes.map((node) => node.y)).size).toBe(2);
    expect(new Set(model.nodes.filter((node) => node.commit.id.startsWith("side")).map((node) => node.y)).size).toBe(1);
    for (const mix of [0, 0.5, 1]) {
      const points = projectGraphNodes(model.nodes, 680, 280, { yaw: -0.38, pitch: 0.42, zoom: 1 }, mix);
      expect(points.every((point) => point.x >= 20 && point.x <= 660 && point.y >= 20 && point.y <= 260)).toBe(true);
    }
  });

  it("fits simultaneous branches in desktop and mobile projections", () => {
    const history = [commit("root", []),
      ...Array.from({ length: 10 }, (_, index) => commit(`side${index}`, ["root"])),
      commit("merge", Array.from({ length: 10 }, (_, index) => `side${index}`)),
    ];
    const model = createGraphModel(history);
    expect(new Set(model.nodes.slice(1, -1).map((node) => node.y)).size).toBe(10);
    for (const [width, height] of [[680, 280], [320, 260]]) {
      for (const yaw of [-0.38, 1.5, 3]) {
        for (const mix of [0, 0.5, 1]) {
          const points = projectGraphNodes(model.nodes, width, height, { yaw, pitch: 0.42, zoom: 1 }, mix);
          expect(points.every((point) => point.x >= 20 && point.x <= width - 20 &&
            point.y >= 20 && point.y <= height - 20)).toBe(true);
        }
      }
    }
  });
});
