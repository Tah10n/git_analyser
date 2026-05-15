import { useCallback, useState } from "react";
import type { ExplorerCommit, RepositorySummary } from "../types";
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
};

const tokenKey = "git-history-explorer-token";

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
    }));

    try {
      const result = await loadRepositoryHistory({
        input,
        token,
        maxCommits: 20,
      });

      setState({
        commits: result.commits,
        repository: result.repository,
        status: result.commits.length > 0 ? "ready" : "empty",
        rateLimit: result.rateLimit,
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
        rateLimit:
          error instanceof GitHubApiError ? error.rateLimit : current.rateLimit,
      }));
    }
  }, [input, token]);

  return {
    ...state,
    input,
    token,
    setInput,
    setToken,
    load,
  };
};
