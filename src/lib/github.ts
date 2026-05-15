import type {
  ChangeStatus,
  CommitChange,
  ExplorerCommit,
  HistoryCheckpoint,
  RepositorySummary,
} from "../types";

export type ParsedRepository = {
  owner: string;
  name: string;
};

export type RateLimitInfo = {
  limit?: number;
  remaining?: number;
  resetAt?: string;
};

export type LoadedHistory = {
  repository: RepositorySummary;
  commits: ExplorerCommit[];
  checkpoints: HistoryCheckpoint[];
  rateLimit?: RateLimitInfo;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type GitHubRepositoryResponse = {
  default_branch: string;
  html_url: string;
  name: string;
  owner: {
    login: string;
  };
};

type GitHubCommitListItem = {
  sha: string;
};

type GitHubCommitFile = {
  filename: string;
  previous_filename?: string;
  status: string;
};

type GitHubCommitDetail = {
  sha: string;
  commit: {
    author?: {
      date?: string;
      name?: string;
    };
    committer?: {
      date?: string;
      name?: string;
    };
    message: string;
  };
  files?: GitHubCommitFile[];
};

type GitHubTreeResponse = {
  tree: Array<{
    path?: string;
    type?: string;
  }>;
};

export class GitHubApiError extends Error {
  readonly status: number;
  readonly rateLimit?: RateLimitInfo;

  constructor(message: string, status: number, rateLimit?: RateLimitInfo) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
    this.rateLimit = rateLimit;
  }
}

const apiBase = "https://api.github.com";
const requestHeaders = {
  accept: "application/vnd.github+json",
  apiVersion: "2022-11-28",
};

export const parseRepositoryInput = (rawInput: string): ParsedRepository | null => {
  const input = rawInput.trim();

  if (!input) {
    return null;
  }

  const urlMatch = input.match(
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+)(?:[/?#].*)?$/i,
  );
  const shorthandMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);
  const match = urlMatch ?? shorthandMatch;

  if (!match) {
    return null;
  }

  const owner = match[1];
  const name = match[2].replace(/\.git$/i, "");

  if (!owner || !name) {
    return null;
  }

  return { owner, name };
};

const numberHeader = (headers: Headers, name: string): number | undefined => {
  const value = headers.get(name);
  return value ? Number(value) : undefined;
};

const readRateLimit = (headers: Headers): RateLimitInfo => {
  const reset = headers.get("x-ratelimit-reset");
  const resetAt = reset
    ? new Date(Number(reset) * 1000).toISOString()
    : undefined;

  return {
    limit: numberHeader(headers, "x-ratelimit-limit"),
    remaining: numberHeader(headers, "x-ratelimit-remaining"),
    resetAt,
  };
};

const requestJson = async <T>(
  path: string,
  token: string,
  fetcher: Fetcher,
): Promise<{ data: T; rateLimit: RateLimitInfo }> => {
  const headers: Record<string, string> = {
    Accept: requestHeaders.accept,
    "X-GitHub-Api-Version": requestHeaders.apiVersion,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetcher(`${apiBase}${path}`, { headers });
  const rateLimit = readRateLimit(response.headers);

  if (!response.ok) {
    const suffix = rateLimit.remaining === 0 ? " GitHub rate limit reached." : "";
    throw new GitHubApiError(
      `GitHub request failed with ${response.status}.${suffix}`,
      response.status,
      rateLimit,
    );
  }

  return {
    data: (await response.json()) as T,
    rateLimit,
  };
};

const normalizeStatus = (status: string): ChangeStatus => {
  switch (status) {
    case "added":
      return "added";
    case "removed":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
};

const statusLabel = (status: ChangeStatus): string => {
  switch (status) {
    case "added":
      return "Added";
    case "modified":
      return "Updated";
    case "deleted":
      return "Deleted";
    case "renamed":
      return "Renamed";
  }
};

const normalizeChange = (file: GitHubCommitFile): CommitChange => {
  const status = normalizeStatus(file.status);
  return {
    path: file.filename,
    previousPath: file.previous_filename,
    status,
    summary: `${statusLabel(status)} ${file.filename}`,
  };
};

const applyChanges = (paths: Set<string>, changes: CommitChange[]): void => {
  for (const change of changes) {
    if (change.status === "deleted") {
      paths.delete(change.path);
      continue;
    }

    if (change.status === "renamed" && change.previousPath) {
      paths.delete(change.previousPath);
    }

    paths.add(change.path);
  }
};

const getTreePaths = (tree: GitHubTreeResponse): string[] =>
  tree.tree
    .filter((entry) => entry.type === "blob" && entry.path)
    .map((entry) => entry.path ?? "")
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));

const createCheckpoints = (
  commits: ExplorerCommit[],
  interval: number,
): HistoryCheckpoint[] =>
  commits.reduce<HistoryCheckpoint[]>((checkpoints, commit, index) => {
    if (
      index === 0 ||
      index % interval === 0 ||
      index === commits.length - 1
    ) {
      checkpoints.push({
        index,
        snapshot: commit.snapshot,
      });
    }

    return checkpoints;
  }, []);

const shortHash = (sha: string): string => sha.slice(0, 7);

export const loadRepositoryHistory = async ({
  input,
  token = "",
  maxCommits = 20,
  fetcher = fetch,
}: {
  input: string;
  token?: string;
  maxCommits?: number;
  fetcher?: Fetcher;
}): Promise<LoadedHistory> => {
  const parsed = parseRepositoryInput(input);

  if (!parsed) {
    throw new GitHubApiError("Enter a valid GitHub repository.", 0);
  }

  const normalizedToken = token.trim();
  const repoPath = `/repos/${parsed.owner}/${parsed.name}`;
  const repoResponse = await requestJson<GitHubRepositoryResponse>(
    repoPath,
    normalizedToken,
    fetcher,
  );
  const repository = repoResponse.data;
  const branch = repository.default_branch;
  const commitListResponse = await requestJson<GitHubCommitListItem[]>(
    `${repoPath}/commits?sha=${encodeURIComponent(branch)}&per_page=${maxCommits}`,
    normalizedToken,
    fetcher,
  );
  const orderedList = [...commitListResponse.data].reverse();

  if (orderedList.length === 0) {
    return {
      repository: {
        owner: repository.owner.login,
        name: repository.name,
        url: repository.html_url,
        branch,
      },
      commits: [],
      checkpoints: [],
      rateLimit: commitListResponse.rateLimit,
    };
  }

  const seedSha = orderedList[0].sha;
  const treeResponse = await requestJson<GitHubTreeResponse>(
    `${repoPath}/git/trees/${seedSha}?recursive=1`,
    normalizedToken,
    fetcher,
  );
  const paths = new Set(getTreePaths(treeResponse.data));
  const commits: ExplorerCommit[] = [];

  for (const [index, item] of orderedList.entries()) {
    const detailResponse = await requestJson<GitHubCommitDetail>(
      `${repoPath}/commits/${item.sha}`,
      normalizedToken,
      fetcher,
    );
    const detail = detailResponse.data;
    const changes = (detail.files ?? []).map(normalizeChange);

    if (index > 0) {
      applyChanges(paths, changes);
    }

    commits.push({
      id: detail.sha,
      shortHash: shortHash(detail.sha),
      message: detail.commit.message.match(/[^\r\n]+/)?.[0] ?? shortHash(detail.sha),
      author:
        detail.commit.author?.name ??
        detail.commit.committer?.name ??
        repository.owner.login,
      date:
        detail.commit.author?.date ??
        detail.commit.committer?.date ??
        new Date(0).toISOString(),
      branch,
      changes,
      snapshot: [...paths].sort((left, right) => left.localeCompare(right)),
    });
  }

  return {
    repository: {
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
      branch,
    },
    commits,
    checkpoints: createCheckpoints(commits, 5),
    rateLimit: treeResponse.rateLimit,
  };
};
