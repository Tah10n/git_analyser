import type { ChangeStatus, CommitChange, TreeNode } from "../types";

type MutableTreeNode = TreeNode & {
  childMap: Map<string, MutableTreeNode>;
};

const makeNode = (
  name: string,
  path: string,
  kind: TreeNode["kind"],
  depth: number,
): MutableTreeNode => ({
  id: path || "root",
  name,
  path,
  kind,
  depth,
  children: [],
  childMap: new Map(),
});

const sortNodes = (nodes: MutableTreeNode[]): TreeNode[] =>
  [...nodes]
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "folder" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    })
    .map(({ childMap: _childMap, ...node }) => ({
      ...node,
      children: sortNodes(node.children as MutableTreeNode[]),
    }));

export const buildStatusMap = (
  changes: CommitChange[],
): Map<string, Pick<CommitChange, "status" | "previousPath">> => {
  const statuses = new Map<string, Pick<CommitChange, "status" | "previousPath">>();

  for (const change of changes) {
    statuses.set(change.path, {
      status: change.status,
      previousPath: change.previousPath,
    });
  }

  return statuses;
};

const createDeletedGhostPaths = (changes: CommitChange[]): string[] =>
  changes
    .filter((change) => change.status === "deleted")
    .map((change) => change.path);

const upsertPath = (
  root: MutableTreeNode,
  path: string,
  statuses: Map<string, Pick<CommitChange, "status" | "previousPath">>,
): void => {
  const parts = path.match(/[^/]+/g) ?? [];
  let cursor = root;

  parts.forEach((part, index) => {
    const childPath = parts.slice(0, index + 1).join("/");
    const isFile = index === parts.length - 1;
    const existing = cursor.childMap.get(part);

    if (existing) {
      cursor = existing;
      return;
    }

    const node = makeNode(part, childPath, isFile ? "file" : "folder", index);
    const status = statuses.get(childPath);

    if (status) {
      node.status = status.status;
      node.previousPath = status.previousPath;
    }

    cursor.childMap.set(part, node);
    cursor.children.push(node);
    cursor = node;
  });
};

export const buildTree = (snapshot: string[], changes: CommitChange[]): TreeNode[] => {
  const root = makeNode("", "", "folder", -1);
  const statuses = buildStatusMap(changes);
  const paths = new Set([...snapshot, ...createDeletedGhostPaths(changes)]);

  for (const path of paths) {
    upsertPath(root, path, statuses);
  }

  return sortNodes(root.children as MutableTreeNode[]);
};

export const getChangeTone = (status: ChangeStatus): string => {
  switch (status) {
    case "added":
      return "Added";
    case "modified":
      return "Modified";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
  }
};
