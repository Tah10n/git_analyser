import type { ExplorerCommit } from "../types";

export const getBranchScopedCommits = (
  commits: ExplorerCommit[],
  selectedBranch: string,
): ExplorerCommit[] => {
  const scoped = commits.filter(
    (commit) =>
      commit.branch === selectedBranch ||
      (commit.branches ?? [commit.branch]).includes(selectedBranch),
  );

  return scoped.length > 0 ? scoped : commits;
};

export const getPreservedCommitIndex = (
  commits: ExplorerCommit[],
  selectedCommitId?: string,
): number =>
  selectedCommitId
    ? commits.findIndex((commit) => commit.id === selectedCommitId)
    : -1;
