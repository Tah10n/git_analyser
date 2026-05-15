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
  shortHash: string;
  message: string;
  author: string;
  date: string;
  branch: string;
  changes: CommitChange[];
  snapshot: string[];
};

export type RepositorySummary = {
  owner: string;
  name: string;
  url: string;
  branch: string;
};

export type HistoryCheckpoint = {
  index: number;
  snapshot: string[];
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
