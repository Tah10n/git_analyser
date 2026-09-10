import type {
  ChangeStatus,
  CommitChange,
  CommitGraph,
  ExplorerCommit,
  HistoryCheckpoint,
  RepositoryBranch,
  RepositorySummary,
} from "../types";
import { chooseCheckpointInterval } from "./performance";
import { browserLimits } from "./limits";

export type ParsedRepository = {
  owner: string;
  name: string;
  branch?: string;
};

export type RateLimitInfo = {
  limit?: number;
  remaining?: number;
  resetAt?: string;
};

export type LoadedHistory = {
  repository: RepositorySummary;
  branches: RepositoryBranch[];
  commits: ExplorerCommit[];
  checkpoints: HistoryCheckpoint[];
  graph?: CommitGraph;
  selectedBranch: string;
  historyMode: "recent";
  notice?: string;
  rateLimit?: RateLimitInfo;
  source: "browser" | "service";
  treeFileCount: number;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

type GitHubRepositoryResponse = {
  id: number;
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

type GitHubBranchResponse = {
  name: string;
  commit: {
    sha: string;
  };
};

type GitHubCommitFile = {
  filename: string;
  previous_filename?: string;
  status: string;
};

type GitHubCommitDetail = {
  filesTruncated?: boolean;
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
  truncated?: boolean;
};

type AnalyzerChange = {
  path: string;
  previousPath?: string;
  status: ChangeStatus;
};

type AnalyzerCommit = {
  snapshot?: string[];
  author: string;
  changes: AnalyzerChange[];
  date: string;
  id: string;
  parents?: string[];
  shortHash: string;
  title: string;
};

type AnalyzerHistoryResult = {
  branches?: Array<{
    name?: string;
    sha?: string;
    isDefault?: boolean;
  }>;
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
    defaultBranch?: string;
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

  const normalizedUrl = input.match(/^https?:\/\//i) ? input : `https://${input}`;
  try {
    const url = new URL(normalizedUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname === "github.com" || hostname === "www.github.com") {
      const pathParts = url.pathname.replace(/^\/+/, "").match(/[^/]+/g) ?? [];
      const [owner, rawName, marker, ...rest] = pathParts;
      const name = rawName?.replace(/\.git$/i, "");
      const branch =
        marker === "tree" && rest.length > 0
          ? decodeURIComponent(rest.join("/"))
          : undefined;

      if (owner && name) {
        return branch ? { owner, name, branch } : { owner, name };
      }
    }
  } catch {
    // Fall through to owner/name shorthand parsing.
  }

  const shorthandMatch = input.match(/^([^/\s]+)\/([^/\s]+)$/);

  if (!shorthandMatch) {
    return null;
  }

  const owner = shorthandMatch[1];
  const name = shorthandMatch[2].replace(/\.git$/i, "");

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
): Promise<{ data: T; rateLimit: RateLimitInfo; link: string | null }> => {
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
    link: response.headers.get("link"),
  };
};

const loadCommitDetail = async (
  path: string,
  token: string,
  fetcher: Fetcher,
  repositoryId: number,
): Promise<GitHubCommitDetail> => {
  let response = await requestJson<GitHubCommitDetail>(path, token, fetcher);
  const detail = { ...response.data, files: [...(response.data.files ?? [])] };
  const visited = new Set<string>([path]);
  while (response.link) {
    const next = response.link.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    if (!next) break;
    if (detail.files.length >= 3000 || visited.size >= 100) {
      detail.filesTruncated = true;
      break;
    }
    const url = new URL(next, apiBase);
    const sha = path.slice(path.lastIndexOf("/") + 1);
    const canonicalPath = `/repositories/${repositoryId}/commits/${sha}`;
    const nextPath = `${path}${url.search}`;
    // GitHub links may use the repository's numeric ID. Keep requests on the
    // original endpoint after verifying that the link identifies this commit.
    if (url.origin !== apiBase ||
        (url.pathname !== path && url.pathname !== canonicalPath) ||
        visited.has(nextPath)) {
      throw new GitHubApiError("Invalid commit file pagination response.", 0);
    }
    visited.add(nextPath);
    response = await requestJson<GitHubCommitDetail>(nextPath, token, fetcher);
    detail.files.push(...(response.data.files ?? []));
  }
  // GitHub caps the complete listing at 3000, even without another page link.
  detail.filesTruncated ||= detail.files.length >= 3000;
  return detail;
};

const normalizeBranches = (
  branches: GitHubBranchResponse[],
  defaultBranch: string,
): RepositoryBranch[] => {
  const normalized = branches
    .map((branch) => ({
      name: branch.name,
      sha: branch.commit.sha,
      isDefault: branch.name === defaultBranch,
    }))
    .sort((left, right) => {
      if (left.isDefault) {
        return -1;
      }

      if (right.isDefault) {
        return 1;
      }

      return left.name.localeCompare(right.name);
    });

  if (normalized.some((branch) => branch.name === defaultBranch)) {
    return normalized;
  }

  return [
    {
      name: defaultBranch,
      sha: "",
      isDefault: true,
    },
    ...normalized,
  ];
};

const branchHeadRefs = (
  branches: RepositoryBranch[],
  sha: string,
): string[] =>
  branches
    .filter((branch) => branch.sha === sha)
    .map((branch) => `refs/heads/${branch.name}`);

const branchNamesForCommit = (
  branches: RepositoryBranch[],
  sha: string,
  selectedBranch: string,
): string[] => {
  const names = branches
    .filter((branch) => branch.sha === sha)
    .map((branch) => branch.name);

  if (!names.includes(selectedBranch)) {
    names.push(selectedBranch);
  }

  return [...new Set(names)];
};

const resolveSelectedBranch = ({
  branches,
  defaultBranch,
  requestedBranch,
}: {
  branches: RepositoryBranch[];
  defaultBranch: string;
  requestedBranch?: string;
}): { branch: string; notice?: string } => {
  if (!requestedBranch) {
    return { branch: defaultBranch };
  }

  if (branches.some((branch) => branch.name === requestedBranch)) {
    return { branch: requestedBranch };
  }

  return {
    branch: defaultBranch,
    notice: `Branch ${requestedBranch} was not found; loaded ${defaultBranch}.`,
  };
};

const loadBranches = async ({
  defaultBranch,
  fetcher,
  normalizedToken,
  repoPath,
  requestedBranch,
}: {
  defaultBranch: string;
  fetcher: Fetcher;
  normalizedToken: string;
  repoPath: string;
  requestedBranch?: string;
}): Promise<{ branches: RepositoryBranch[]; rateLimit: RateLimitInfo }> => {
  const branchResponse = await requestJson<GitHubBranchResponse[]>(
    `${repoPath}/branches?per_page=100`,
    normalizedToken,
    fetcher,
  );
  let branches = normalizeBranches(branchResponse.data, defaultBranch);
  let rateLimit = branchResponse.rateLimit;

  if (
    requestedBranch &&
    !branches.some((branch) => branch.name === requestedBranch)
  ) {
    try {
      const requestedBranchResponse = await requestJson<GitHubBranchResponse>(
        `${repoPath}/branches/${encodeURIComponent(requestedBranch)}`,
        normalizedToken,
        fetcher,
      );
      branches = normalizeBranches(
        [...branchResponse.data, requestedBranchResponse.data],
        defaultBranch,
      );
      rateLimit = requestedBranchResponse.rateLimit;
    } catch (error) {
      if (!(error instanceof GitHubApiError && error.status === 404)) {
        throw error;
      }
    }
  }

  return { branches, rateLimit };
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

const applyChanges = (
  paths: Set<string>,
  changes: Pick<CommitChange, "path" | "previousPath" | "status">[],
): void => {
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
      commit.checkpointIndex = index;
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
  const defaultBranch = data.repository.defaultBranch ?? branch;
  const branches =
    data.branches?.length
      ? data.branches.map((candidate) => ({
          name: candidate.name ?? branch,
          sha: candidate.sha ?? "",
          isDefault: Boolean(candidate.isDefault ?? candidate.name === defaultBranch),
        }))
      : [
          {
            name: branch,
            sha: data.commits[0]?.id ?? "",
            isDefault: branch === defaultBranch,
          },
        ];
  const byId = new Map(data.commits.map((commit) => [commit.id, commit]));
  const snapshots = new Map<string, string[]>();
  const resolving = new Set<string>();
  const snapshotFor = (commit: AnalyzerCommit): string[] => {
    const cached = snapshots.get(commit.id);
    if (cached) return cached;
    if (resolving.has(commit.id)) throw new Error("Cyclic analyzer history.");
    resolving.add(commit.id);
    let snapshot = commit.snapshot;
    if (!snapshot) {
      const parents = commit.parents ?? [];
      const parent = byId.get(parents[0]);
      if (parents.length > 1 || (parents.length > 0 && !parent)) {
        throw new Error("Analyzer history needs a boundary or merge tree snapshot.");
      }
      const paths = new Set(parent ? snapshotFor(parent) : []);
      applyChanges(paths, commit.changes);
      snapshot = [...paths];
    }
    snapshot = [...snapshot].sort((left, right) => left.localeCompare(right));
    snapshots.set(commit.id, snapshot);
    resolving.delete(commit.id);
    return snapshot;
  };
  let maxFileCount = 0;
  const commits = [...data.commits].reverse().map((commit): ExplorerCommit => {
    const changes = commit.changes.map((change): CommitChange => ({
      path: change.path,
      previousPath: change.previousPath,
      status: change.status,
      summary: `${statusLabel(change.status)} ${change.path}`,
    }));
    const snapshot = snapshotFor(commit);
    maxFileCount = Math.max(maxFileCount, snapshot.length);

    return {
      id: commit.id,
      fullSha: commit.id,
      shortHash: commit.shortHash || shortHash(commit.id),
      title: commit.title,
      message: commit.title,
      author: commit.author,
      date: commit.date,
      branch,
      parentShas: commit.parents ?? [],
      parents: commit.parents ?? [],
      refs: branchHeadRefs(branches, commit.id),
      branches: branchNamesForCommit(branches, commit.id, branch),
      changes,
      snapshot,
    };
  });

  const truncated = data.limits?.hasMore || data.limits?.truncated;
  return {
    repository: {
      owner: data.repository.owner,
      name: data.repository.name,
      url: data.repository.url,
      branch,
      defaultBranch,
    },
    branches,
    commits,
    checkpoints: createCheckpoints(
      commits,
      chooseCheckpointInterval(commits.length, maxFileCount),
    ),
    graph: data.graph ?? buildGraphFromCommits(commits),
    selectedBranch: branch,
    historyMode: "recent",
    notice: truncated
      ? `Analyzer service returned ${commits.length.toLocaleString()} commits; more history is available on the backend.`
      : `Analyzer service loaded ${commits.length.toLocaleString()} commits.`,
    source: "service",
    treeFileCount: maxFileCount,
  };
};

const loadRepositoryHistoryFromAnalyzer = async ({
  analyzerUrl,
  branch,
  input,
  maxCommits,
  parsed,
  fetcher,
}: {
  analyzerUrl: string;
  branch?: string;
  input: string;
  maxCommits: number;
  parsed: ParsedRepository;
  fetcher: Fetcher;
}): Promise<LoadedHistory> => {
  const response = await fetcher(`${analyzerUrl}/history/analyze`, {
    body: JSON.stringify({
      allHistory: true,
      ref: branch,
      maxCommits,
      url: toBrowserUrl(parsed),
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
  branch,
  input,
  token = "",
  maxCommits = 20,
  fetcher = fetch,
}: {
  analyzerUrl?: string;
  branch?: string;
  input: string;
  token?: string;
  maxCommits?: number;
  fetcher?: Fetcher;
}): Promise<LoadedHistory> => {
  const parsed = parseRepositoryInput(input);

  if (!parsed) {
    throw new GitHubApiError("Enter a valid GitHub repository.", 0);
  }

  const requestedBranch = branch ?? parsed.branch;
  const normalizedAnalyzerUrl = analyzerBaseUrl(analyzerUrl);
  if (normalizedAnalyzerUrl) {
    try {
      return await loadRepositoryHistoryFromAnalyzer({
        analyzerUrl: normalizedAnalyzerUrl,
        branch: requestedBranch,
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
  const defaultBranch = repository.default_branch;
  const branchResult = await loadBranches({
    defaultBranch,
    fetcher,
    normalizedToken,
    repoPath,
    requestedBranch,
  });
  const branches = branchResult.branches;
  const selected = resolveSelectedBranch({
    branches,
    defaultBranch,
    requestedBranch,
  });
  const selectedBranch = selected.branch;
  const browserCommitLimit = Math.min(maxCommits, browserLimits.maxCommits);
  const commitListResponse = await requestJson<GitHubCommitListItem[]>(
    `${repoPath}/commits?sha=${encodeURIComponent(selectedBranch)}&per_page=${browserCommitLimit}`,
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
        branch: selectedBranch,
        defaultBranch,
      },
      branches,
      commits: [],
      checkpoints: [],
      rateLimit: commitListResponse.rateLimit,
      source: "browser",
      treeFileCount: 0,
      graph: buildGraphFromCommits([]),
      selectedBranch,
      historyMode: "recent",
      notice: selected.notice,
    };
  }

  const seedSha = orderedList[0].sha;
  const treeResponse = await requestJson<GitHubTreeResponse>(
    `${repoPath}/git/trees/${seedSha}?recursive=1`,
    normalizedToken,
    fetcher,
  );
  const snapshots = new Map<string, string[]>([[seedSha, getTreePaths(treeResponse.data)]]);
  let treeTruncated = Boolean(treeResponse.data.truncated);
  let rateLimit = treeResponse.rateLimit;
  let maxFileCount = snapshots.get(seedSha)!.length;
  const commits: ExplorerCommit[] = [];

  const batchSize = 6;
  const details: GitHubCommitDetail[] = new Array(orderedList.length);
  for (let i = 0; i < orderedList.length; i += batchSize) {
    const chunk = orderedList.slice(i, i + batchSize);
    const chunkResults = await Promise.all(
      chunk.map((item) =>
        loadCommitDetail(
          `${repoPath}/commits/${item.sha}`,
          normalizedToken,
          fetcher,
          repository.id,
        ),
      ),
    );
    for (let j = 0; j < chunkResults.length; j += 1) {
      details[i + j] = chunkResults[j];
    }
  }

  const bySha = new Map(details.map((detail) => [detail.sha, detail]));
  const resolving = new Set<string>();
  const snapshotFor = async (detail: GitHubCommitDetail): Promise<string[]> => {
    const cached = snapshots.get(detail.sha);
    if (cached) return cached;
    if (resolving.has(detail.sha)) throw new GitHubApiError("Cyclic commit history.", 0);
    resolving.add(detail.sha);
    const parent = bySha.get(detail.parents?.[0]?.sha ?? "");
    let snapshot: string[];
    if (parent && !detail.filesTruncated) {
      const paths = new Set(await snapshotFor(parent));
      applyChanges(paths, (detail.files ?? []).map(normalizeChange));
      snapshot = [...paths].sort((left, right) => left.localeCompare(right));
    } else {
      const tree = await requestJson<GitHubTreeResponse>(
        `${repoPath}/git/trees/${detail.sha}?recursive=1`, normalizedToken, fetcher,
      );
      snapshot = getTreePaths(tree.data);
      treeTruncated ||= Boolean(tree.data.truncated);
      rateLimit = tree.rateLimit;
    }
    snapshots.set(detail.sha, snapshot);
    resolving.delete(detail.sha);
    return snapshot;
  };

  for (const detail of details) {
    const changes = (detail.files ?? []).map(normalizeChange);
    const snapshot = await snapshotFor(detail);
    maxFileCount = Math.max(maxFileCount, snapshot.length);

    commits.push({
      id: detail.sha,
      fullSha: detail.sha,
      shortHash: shortHash(detail.sha),
      title: detail.commit.message.match(/[^\r\n]+/)?.[0] ?? shortHash(detail.sha),
      message: detail.commit.message.match(/[^\r\n]+/)?.[0] ?? shortHash(detail.sha),
      author:
        detail.commit.author?.name ??
        detail.commit.committer?.name ??
        repository.owner.login,
      date:
        detail.commit.author?.date ??
        detail.commit.committer?.date ??
        new Date(0).toISOString(),
      branch: selectedBranch,
      parentShas: (detail.parents ?? []).map((parent) => parent.sha),
      parents: (detail.parents ?? []).map((parent) => parent.sha),
      refs: branchHeadRefs(branches, detail.sha),
      branches: branchNamesForCommit(branches, detail.sha, selectedBranch),
      changes,
      snapshot,
    });
  }

  const truncatedNotice = treeTruncated
    ? "Repository tree exceeds GitHub API size limit; some files may not be visible."
    : undefined;

  return {
    repository: {
      owner: repository.owner.login,
      name: repository.name,
      url: repository.html_url,
      branch: selectedBranch,
      defaultBranch,
    },
    branches,
    commits,
    checkpoints: createCheckpoints(
      commits,
      chooseCheckpointInterval(commits.length, maxFileCount),
    ),
    graph: buildGraphFromCommits(commits),
    selectedBranch,
    historyMode: "recent",
    notice: [
      selected.notice,
      truncatedNotice,
      details.some((detail) => detail.filesTruncated)
        ? "A commit reached GitHub's 3000-file limit; its change list may be incomplete."
        : undefined,
      normalizedAnalyzerUrl
        ? "Analyzer service was unavailable; loaded the browser GitHub API fallback."
        : undefined,
    ].filter(Boolean).join(" ") || undefined,
    rateLimit,
    source: "browser",
    treeFileCount: maxFileCount,
  };
};
