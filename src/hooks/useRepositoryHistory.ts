import { useCallback, useState } from "react";
import type { ExplorerCommit, RepositorySummary } from "../types";
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
  commits: ExplorerCommit[];
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
  const [input, setInput] = useState(initialInput);
  const [token, setTokenState] = useState(readSavedToken);
  const [state, setState] = useState<HistoryState>({
    commits: [],
    status: "idle",
  });

  const setToken = (nextToken: string) => {
    setTokenState(nextToken);
    saveToken(nextToken.trim());
  };

  const load = useCallback(async () => {
    setState((current) => ({
      ...current,
      status: "loading",
      error: undefined,
      warning: undefined,
    }));

    try {
      const loadLimit = analyzerUrl ? analyzerMaxCommits : maxCommits;
      const cacheKey = createHistoryCacheKey(`${analyzerUrl ? `service:${analyzerUrl}:` : "browser:"}${input}`, loadLimit);
      const cached = await getCachedHistory(cacheKey);

      if (cached) {
        setState({
          commits: cached.commits,
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
        input,
        token,
        maxCommits: loadLimit,
      });
      await saveCachedHistory(cacheKey, result);

      setState({
        commits: result.commits,
        repository: result.repository,
        status: result.commits.length > 0 ? "ready" : "empty",
        rateLimit: result.rateLimit,
        source: result.source,
        warning: createSizeWarning(result.commits.length, result.treeFileCount, result.notice),
      });
    } catch (error) {
      const message =
        error instanceof GitHubApiError || error instanceof Error
          ? error.message
          : "Unable to load repository history.";

      setState((current) => ({
        ...current,
        status: "error",
        error: message,
        warning: undefined,
        source: undefined,
        rateLimit:
          error instanceof GitHubApiError ? error.rateLimit : current.rateLimit,
      }));
    }
  }, [input, token]);

  const clearCache = useCallback(async () => {
    await clearHistoryCache();
    setState((current) => ({
      ...current,
      warning: "Cache cleared.",
    }));
  }, []);

  return {
    ...state,
    input,
    token,
    setInput,
    setToken,
    load,
    clearCache,
  };
};
