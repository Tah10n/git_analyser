import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CommitGraph,
  ExplorerCommit,
  HistoryMode,
  RepositoryBranch,
  RepositorySummary,
} from "../types";
import {
  clearHistoryCache,
  createHistoryCacheKey,
  getCachedHistory,
  saveCachedHistory,
} from "../lib/cache";
import { browserLimits } from "../lib/limits";
import {
  GitHubApiError,
  loadRepositoryHistory,
  type RateLimitInfo,
} from "../lib/github";

type LoadStatus = "idle" | "loading" | "ready" | "empty" | "error";

type HistoryState = {
  branches: RepositoryBranch[];
  commits: ExplorerCommit[];
  graph?: CommitGraph;
  loadedInput?: string;
  repository?: RepositorySummary;
  status: LoadStatus;
  error?: string;
  rateLimit?: RateLimitInfo;
  source?: "browser" | "service";
  warning?: string;
};

const tokenKey = "git-history-explorer-token";
const maxCommits = browserLimits.maxCommits;
const analyzerMaxCommits = browserLimits.handoffCommitCount;
const analyzerUrl = import.meta.env.VITE_ANALYZER_URL;
const historyMode: HistoryMode = "recent";

const createSizeWarning = (
  commitCount: number,
  fileCount: number,
  notice?: string,
): string | undefined => {
  if (notice) {
    return notice;
  }

  if (fileCount > browserLimits.warningFileCount) {
    return `Large tree detected: ${fileCount.toLocaleString()} files loaded.`;
  }

  if (commitCount >= maxCommits) {
    return `Loaded the first ${maxCommits} commits for this branch.`;
  }

  return undefined;
};

const readSavedToken = (): string => {
  try {
    return window.localStorage.getItem(tokenKey) ?? "";
  } catch {
    return "";
  }
};

const saveToken = (token: string): void => {
  try {
    if (token) {
      window.localStorage.setItem(tokenKey, token);
    } else {
      window.localStorage.removeItem(tokenKey);
    }
  } catch {
    // Storage access can be disabled; the current in-memory value still works.
  }
};

export const useRepositoryHistory = (initialInput: string) => {
  const loadVersion = useRef(0);
  useEffect(() => () => {
    loadVersion.current += 1;
  }, []);
  const [input, setInput] = useState(initialInput);
  const [token, setTokenState] = useState(readSavedToken);
  const [selectedBranch, setSelectedBranchState] = useState<string>();
  const [state, setState] = useState<HistoryState>({
    branches: [],
    commits: [],
    status: "idle",
  });

  const setToken = (nextToken: string) => {
    setTokenState(nextToken);
    saveToken(nextToken.trim());
  };

  const setRepositoryInput = (nextInput: string) => {
    if (nextInput === input) return;
    loadVersion.current += 1;
    setInput(nextInput);
    setSelectedBranchState(undefined);
    setState((current) => current.status === "loading" ? {
      ...current,
      status: current.commits.length > 0 ? "ready" : current.repository ? "empty" : "idle",
    } : current);
  };

  const load = useCallback(async (branchOverride?: string) => {
    const version = ++loadVersion.current;
    const isCurrent = () => version === loadVersion.current;
    const selectedBranchForInput =
      state.loadedInput === input ? selectedBranch : undefined;
    const branchForLoad = branchOverride ?? selectedBranchForInput ?? "";

    setState((current) => ({
      ...current,
      branches: current.loadedInput === input ? current.branches : [],
      commits: current.loadedInput === input ? current.commits : [],
      graph: current.loadedInput === input ? current.graph : undefined,
      loadedInput: input,
      repository: current.loadedInput === input ? current.repository : undefined,
      status: "loading",
      error: undefined,
      warning: undefined,
    }));

    try {
      const loadLimit = analyzerUrl ? analyzerMaxCommits : maxCommits;
      const cachePrefix = `${analyzerUrl ? `service:${analyzerUrl}:` : "browser:"}${input}`;
      const cacheKey = createHistoryCacheKey(
        cachePrefix,
        loadLimit,
        branchForLoad,
        historyMode,
      );
      const cached = await getCachedHistory(cacheKey);
      if (!isCurrent()) return;

      if (cached) {
        const cachedBranch = cached.selectedBranch ?? cached.repository.branch;
        setSelectedBranchState(cachedBranch);
        setState({
          branches: cached.branches ?? [
            {
              name: cachedBranch,
              sha: cached.commits.at(-1)?.id ?? "",
              isDefault: cachedBranch === cached.repository.defaultBranch,
            },
          ],
          commits: cached.commits,
          graph: cached.graph,
          loadedInput: input,
          repository: cached.repository,
          status: cached.commits.length > 0 ? "ready" : "empty",
          rateLimit: cached.rateLimit,
          source: cached.source,
          warning: createSizeWarning(cached.commits.length, cached.treeFileCount, cached.notice),
        });
        return;
      }

      const result = await loadRepositoryHistory({
        analyzerUrl,
        branch: branchForLoad || undefined,
        input,
        token,
        maxCommits: loadLimit,
      });
      if (!isCurrent()) return;
      await saveCachedHistory(
        createHistoryCacheKey(
          cachePrefix,
          loadLimit,
          result.selectedBranch,
          result.historyMode,
        ),
        result,
      );
      if (!isCurrent()) return;

      setSelectedBranchState(result.selectedBranch);
      setState({
        branches: result.branches,
        commits: result.commits,
        graph: result.graph,
        loadedInput: input,
        repository: result.repository,
        status: result.commits.length > 0 ? "ready" : "empty",
        rateLimit: result.rateLimit,
        source: result.source,
        warning: createSizeWarning(result.commits.length, result.treeFileCount, result.notice),
      });
    } catch (error) {
      if (!isCurrent()) return;
      const message =
        error instanceof GitHubApiError || error instanceof Error
          ? error.message
          : "Unable to load repository history.";

      setState((current) => ({
        ...current,
        status: "error",
        error: message,
        warning: undefined,
        loadedInput: input,
        graph: undefined,
        source: undefined,
        rateLimit:
          error instanceof GitHubApiError ? error.rateLimit : current.rateLimit,
      }));
    }
  }, [input, selectedBranch, state.loadedInput, token]);

  const selectBranch = useCallback(
    (branch: string) => {
      if (state.repository && state.loadedInput === input) {
        void load(branch);
      } else {
        setSelectedBranchState(branch);
      }
    },
    [input, load, state.loadedInput, state.repository],
  );

  const clearCache = useCallback(async () => {
    await clearHistoryCache();
    setState((current) => ({
      ...current,
      warning: "Cache cleared.",
    }));
  }, []);

  const isCurrentInputLoaded = state.loadedInput === input;

  return {
    ...state,
    branches: isCurrentInputLoaded ? state.branches : [],
    commits: isCurrentInputLoaded ? state.commits : [],
    error: isCurrentInputLoaded ? state.error : undefined,
    graph: isCurrentInputLoaded ? state.graph : undefined,
    historyMode,
    input,
    rateLimit: isCurrentInputLoaded ? state.rateLimit : undefined,
    repository: isCurrentInputLoaded ? state.repository : undefined,
    selectedBranch:
      selectedBranch ?? (isCurrentInputLoaded ? state.repository?.branch : undefined),
    source: isCurrentInputLoaded ? state.source : undefined,
    status: isCurrentInputLoaded ? state.status : "idle",
    token,
    warning: isCurrentInputLoaded ? state.warning : undefined,
    setInput: setRepositoryInput,
    setToken,
    selectBranch,
    load,
    clearCache,
  };
};
