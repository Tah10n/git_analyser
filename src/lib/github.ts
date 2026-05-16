import type {
  ChangeStatus,
  CommitChange,
  CommitGraph,
  ExplorerCommit,
  HistoryCheckpoint,
  RepositorySummary,
} from "../types";
import { chooseCheckpointInterval } from "./performance";

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
  graph?: CommitGraph;
  notice?: string;
  rateLimit?: RateLimitInfo;
  source: "browser" | "service";
  treeFileCount: number;
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
  parents?: Array<{ sha: string }>;
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

type AnalyzerChange = {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
};

type AnalyzerCommit = {
  author: string;
  changes: AnalyzerChange[];
  date: string;
  id: string;
  parents?: string[];
  shortHash: string;
  title: string;
};

type AnalyzerHistoryResult = {
  commits: AnalyzerCommit[];
  graph?: CommitGraph;
  limits?: {
    effective?: number;
    hasMore?: boolean;
    maximum?: number;
    truncated?: boolean;
  };
  ref?: {
    requested?: string;
    selected?: string;
  };
  repository: {
    branch?: string;
    name: string;
    owner: string;
    url: string;
  };
};

type AnalyzerRecord =
  | { type: "status" }
  | { type: "result"; commits?: unknown }
  | { type: "error"; message?: string };

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

const buildGraphFromCommits = (commits: ExplorerCommit[]): CommitGraph => {
  const commitIds = new Set(commits.map((commit) => commit.id));
  const edges = commits.flatMap((commit) =>
    (commit.parents ?? []).map((parent) => ({ from: commit.id, to: parent })),
  );
  const referencedParents = new Set(
    edges.filter((edge) => commitIds.has(edge.to)).map((edge) => edge.to),
  );

  return {
    edges,
    heads: commits
      .map((commit) => commit.id)
      .filter((id) => !referencedParents.has(id)),
    merges: commits
      .filter((commit) => (commit.parents ?? []).length > 1)
      .map((commit) => commit.id),
    nodes: commits.map((commit) => commit.id),
    roots: commits
      .filter((commit) => (commit.parents ?? []).length === 0)
      .map((commit) => commit.id),
  };
};

const analyzerBaseUrl = (value?: string): string | undefined => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.replace(/\/+$/, "");
};

const parseAnalyzerRecords = (text: string): AnalyzerRecord[] =>
  (text.match(/[^\r\n]+/g) ?? []).map((line) => JSON.parse(line) as AnalyzerRecord);

const isAnalyzerResult = (record: AnalyzerRecord): record is AnalyzerRecord & { type: "result"; commits: unknown } =>
  record.type === "result" && Array.isArray(record.commits);

const toBrowserUrl = (parsed: ParsedRepository): string =>
  `https://github.com/${parsed.owner}/${parsed.name}`;

const mapAnalyzerHistory = (data: AnalyzerHistoryResult): LoadedHistory => {
  const branch = data.ref?.selected ?? data.ref?.requested ?? data.repository.branch ?? "HEAD";
  const paths = new Set<string>();
  let maxFileCount = 0;
  const commits = [...data.commits].reverse().map((commit): ExplorerCommit => {
    const changes = commit.changes.map((change): CommitChange => ({
      path: change.path,
      previousPath: change.previousPath,
      status: change.status,
      summary: `${statusLabel(change.status)} ${change.path}`,
    }));
    applyChanges(paths, changes);
    maxFileCount = Math.max(maxFileCount, paths.size);

    return {
      id: commit.id,
      shortHash: commit.shortHash || shortHash(commit.id),
      message: commit.title,
      author: commit.author,
      date: commit.date,
      branch,
      parents: commit.parents ?? [],
      changes,
      snapshot: [...paths].sort((left, right) => left.localeCompare(right)),
    };
  });

  const truncated = data.limits?.hasMore || data.limits?.truncated;
  return {
    repository: {
      owner: data.repository.owner,
      name: data.repository.name,
      url: data.repository.url,
      branch,
    },
    commits,
    checkpoints: createCheckpoints(
      commits,
      chooseCheckpointInterval(commits.length, maxFileCount),
    ),
    graph: data.graph ?? buildGraphFromCommits(commits),
    notice: truncated
      ? `Analyzer service returned ${commits.length.toLocaleString()} commits; more history is available on the backend.`
      : `Analyzer service loaded ${commits.length.toLocaleString()} commits.`,
    source: "service",
    treeFileCount: maxFileCount,
  };
};

const loadRepositoryHistoryFromAnalyzer = async ({
  analyzerUrl,
  input,
  maxCommits,
  parsed,
  fetcher,
}: {
  analyzerUrl: string;
  input: string;
  maxCommits: number;
  parsed: ParsedRepository;
  fetcher: Fetcher;
}): Promise<LoadedHistory> => {
  const response = await fetcher(`${analyzerUrl}/history/analyze`, {
    body: JSON.stringify({
      allHistory: true,
      maxCommits,
      url: input.trim().startsWith("http") ? input.trim() : toBrowserUrl(parsed),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const text = await response.text();
  const records = parseAnalyzerRecords(text);
  const error = records.find((record): record is AnalyzerRecord & { type: "error" } => record.type === "error");
  if (!response.ok || error) {
    throw new GitHubApiError(error?.message ?? `Analyzer service failed with ${response.status}.`, response.status);
  }

  const result = records.find(isAnalyzerResult);
  if (!result) {
    throw new GitHubApiError("Analyzer service did not return history data.", response.status);
  }

  return mapAnalyzerHistory(result as AnalyzerHistoryResult & AnalyzerRecord);
};

export const loadRepositoryHistory = async ({
  analyzerUrl,
  input,
  token = "",
  maxCommits = 20,
  fetcher = fetch,
}: {
  analyzerUrl?: string;
  input: string;
  token?: string;
  maxCommits?: number;
  fetcher?: Fetcher;
}): Promise<LoadedHistory> => {
  const parsed = parseRepositoryInput(input);

  if (!parsed) {
    throw new GitHubApiError("Enter a valid GitHub repository.", 0);
  }

  const normalizedAnalyzerUrl = analyzerBaseUrl(analyzerUrl);
  if (normalizedAnalyzerUrl) {
    try {
      return await loadRepositoryHistoryFromAnalyzer({
        analyzerUrl: normalizedAnalyzerUrl,
        input,
        maxCommits,
        parsed,
        fetcher,
      });
    } catch {
      // Keep the browser GitHub API path available when the optional service is unavailable.
    }
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
      source: "browser",
      treeFileCount: 0,
      graph: buildGraphFromCommits([]),
    };
  }

  const seedSha = orderedList[0].sha;
  const treeResponse = await requestJson<GitHubTreeResponse>(
    `${repoPath}/git/trees/${seedSha}?recursive=1`,
    normalizedToken,
    fetcher,
  );
  const paths = new Set(getTreePaths(treeResponse.data));
  let maxFileCount = paths.size;
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

    maxFileCount = Math.max(maxFileCount, paths.size);

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
      parents: (detail.parents ?? []).map((parent) => parent.sha),
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
    checkpoints: createCheckpoints(
      commits,
      chooseCheckpointInterval(commits.length, maxFileCount),
    ),
    graph: buildGraphFromCommits(commits),
    notice: normalizedAnalyzerUrl
      ? "Analyzer service was unavailable; loaded the browser GitHub API fallback."
      : undefined,
    rateLimit: treeResponse.rateLimit,
    source: "browser",
    treeFileCount: maxFileCount,
  };
};
