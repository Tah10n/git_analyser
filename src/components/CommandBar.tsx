import type { FormEvent } from "react";
import type { RateLimitInfo } from "../lib/github";
import type { RepositoryBranch, RepositorySummary, ThemePreset } from "../types";
import { BranchMarkIcon } from "./icons";

type CommandBarProps = {
  input: string;
  token: string;
  branches: RepositoryBranch[];
  selectedBranch?: string;
  repository: RepositorySummary;
  modeLabel: string;
  isLoading: boolean;
  rateLimit?: RateLimitInfo;
  theme: ThemePreset;
  onInputChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onThemeChange: (theme: ThemePreset) => void;
  onClearCache: () => void;
  onLoad: () => void;
};

const themeOptions: Array<{ label: string; value: ThemePreset }> = [
  { label: "Dark", value: "dark" },
  { label: "Light", value: "light" },
  { label: "JetBrains", value: "jetbrains" },
];

const formatRate = (rateLimit?: RateLimitInfo): string | undefined => {
  if (rateLimit?.remaining === undefined || rateLimit.limit === undefined) {
    return undefined;
  }

  return `Rate ${rateLimit.remaining}/${rateLimit.limit}`;
};

export const CommandBar = ({
  input,
  token,
  branches,
  selectedBranch,
  repository,
  modeLabel,
  isLoading,
  rateLimit,
  theme,
  onInputChange,
  onTokenChange,
  onBranchChange,
  onThemeChange,
  onClearCache,
  onLoad,
}: CommandBarProps) => {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLoad();
  };

  const rateLabel = formatRate(rateLimit);

  return (
    <header className="command-bar">
      <div className="brand-lockup">
        <span className="brand-mark">
          <BranchMarkIcon />
        </span>
        <div>
          <h1>Git History Explorer</h1>
          <p>{repository.owner}/{repository.name}</p>
        </div>
      </div>

      <form className="repo-form" onSubmit={submit}>
        <label className="repo-input">
          <span>Repository</span>
          <input
            onChange={(event) => onInputChange(event.target.value)}
            value={input}
          />
        </label>
        <label className="token-input">
          <span>Token</span>
          <input
            onChange={(event) => onTokenChange(event.target.value)}
            type="password"
            value={token}
          />
        </label>
        <button className="load-button" disabled={isLoading} type="submit">
          {isLoading ? "Loading" : "Load"}
        </button>
      </form>

      <div className="status-cluster">
        <label className="branch-picker">
          <span>Branch</span>
          <select
            disabled={isLoading || branches.length === 0}
            onChange={(event) => onBranchChange(event.target.value)}
            value={selectedBranch ?? repository.branch}
          >
            {branches.length > 0 ? (
              branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                  {branch.isDefault ? " default" : ""}
                </option>
              ))
            ) : (
              <option value={repository.branch}>{repository.branch}</option>
            )}
          </select>
        </label>
        <span>{modeLabel}</span>
        {rateLabel ? <span>{rateLabel}</span> : null}
        <button className="cache-button" onClick={onClearCache} type="button">
          Clear cache
        </button>
      </div>

      <div className="theme-switch" aria-label="Theme">
        {themeOptions.map((option) => (
          <button
            className={theme === option.value ? "is-selected" : ""}
            key={option.value}
            onClick={() => onThemeChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </header>
  );
};
