export type ChangeStatus = "added" | "modified" | "deleted" | "renamed";

export type FileKind = "file" | "folder";

export type CommitChange = {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
  summary: string;
};

export type ExplorerCommit = {
  id: string;
  fullSha: string;
  shortHash: string;
  title: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  parentShas: string[];
  parents: string[];
  refs: string[];
  branches: string[];
  changes: CommitChange[];
  snapshot: string[];
  checkpointIndex?: number;
};

export type HistoryMode = "recent";

export type RepositoryBranch = {
  name: string;
  sha: string;
  isDefault: boolean;
};

export type RepositorySummary = {
  owner: string;
  name: string;
  url: string;
  branch: string;
  defaultBranch: string;
};

export type HistoryCheckpoint = {
  index: number;
  snapshot: string[];
};

export type CommitGraph = {
  edges: { from: string; to: string }[];
  heads: string[];
  merges: string[];
  nodes: string[];
  roots: string[];
};

export type ThemePreset = "dark" | "light" | "jetbrains";

export type TreeNode = {
  id: string;
  name: string;
  path: string;
  kind: FileKind;
  depth: number;
  status?: ChangeStatus;
  previousPath?: string;
  children: TreeNode[];
};
