import { describe, expect, it } from "vitest";
import type { TreeNode } from "../types";
import {
  createAutoExpandedPaths,
  flattenVisibleNodes,
  isExpandedByState,
} from "./FileTree";

const file = (
  path: string,
  status?: TreeNode["status"],
  depth = (path.match(/\//g) ?? []).length,
): TreeNode => ({
  children: [],
  depth,
  kind: "file",
  name: path.match(/[^/]+$/)?.[0] ?? path,
  path,
  status,
  id: path,
});

const folder = (
  path: string,
  children: TreeNode[],
  depth = (path.match(/\//g) ?? []).length,
): TreeNode => ({
  children,
  depth,
  kind: "folder",
  name: path.match(/[^/]+$/)?.[0] ?? path,
  path,
  id: path,
});

const tree = [
  folder("src", [
    folder("src/components", [
      file("src/components/App.tsx", "modified"),
      file("src/components/Button.tsx"),
    ]),
    folder("src/lib", [file("src/lib/utils.ts")]),
  ]),
  file("README.md"),
];

const visiblePaths = ({
  autoExpandedPaths = new Set<string>(),
  changedOnly = false,
  manualExpansion = new Map<string, boolean>(),
  query = "",
  searchExpandedPaths = new Set<string>(),
}: Partial<Parameters<typeof flattenVisibleNodes>[0]> = {}) =>
  flattenVisibleNodes({
    autoExpandedPaths,
    changedOnly,
    manualExpansion,
    nodes: tree,
    query,
    searchExpandedPaths,
  }).map((node) => node.path);

describe("FileTree expansion helpers", () => {
  it("keeps folders collapsed by default", () => {
    expect(visiblePaths()).toEqual(["src", "README.md"]);
  });

  it("auto-expands ancestors for the current commit paths", () => {
    const autoExpandedPaths = createAutoExpandedPaths([
      "src/components/App.tsx",
    ]);

    expect(visiblePaths({ autoExpandedPaths })).toEqual([
      "src",
      "src/components",
      "src/components/App.tsx",
      "src/components/Button.tsx",
      "src/lib",
      "README.md",
    ]);
  });

  it("shows only changed branches in changed-only mode", () => {
    const autoExpandedPaths = createAutoExpandedPaths([
      "src/components/App.tsx",
    ]);

    expect(visiblePaths({ autoExpandedPaths, changedOnly: true })).toEqual([
      "src",
      "src/components",
      "src/components/App.tsx",
    ]);
  });

  it("lets manual expansion override automatic expansion", () => {
    const autoExpandedPaths = createAutoExpandedPaths([
      "src/components/App.tsx",
    ]);
    const manualExpansion = new Map([["src", false]]);

    expect(
      isExpandedByState(
        "src",
        autoExpandedPaths,
        new Set(),
        manualExpansion,
      ),
    ).toBe(false);
    expect(visiblePaths({ autoExpandedPaths, manualExpansion })).toEqual([
      "src",
      "README.md",
    ]);
  });

  it("uses search expansion to reveal matching descendants", () => {
    const searchExpandedPaths = createAutoExpandedPaths(["src/lib/utils.ts"]);

    expect(visiblePaths({ query: "utils", searchExpandedPaths })).toEqual([
      "src",
      "src/lib",
      "src/lib/utils.ts",
    ]);
  });

  it("lets search reveal matching descendants through manually closed folders", () => {
    const manualExpansion = new Map([["src", false]]);
    const searchExpandedPaths = createAutoExpandedPaths(["src/lib/utils.ts"]);

    expect(
      visiblePaths({
        manualExpansion,
        query: "utils",
        searchExpandedPaths,
      }),
    ).toEqual(["src", "src/lib", "src/lib/utils.ts"]);
  });

  it("requires search and changed-only to match the same visible branch", () => {
    const searchExpandedPaths = createAutoExpandedPaths([
      "src/components/Button.tsx",
    ]);

    expect(
      visiblePaths({
        changedOnly: true,
        query: "button",
        searchExpandedPaths,
      }),
    ).toEqual([]);
  });
});
