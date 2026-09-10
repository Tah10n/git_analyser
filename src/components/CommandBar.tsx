import type { FormEvent } from "react";
import type { RateLimitInfo } from "../lib/github";
import type {
  RepositoryBranch,
  RepositorySummary,
  ThemePreset,
} from "../types";
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
  repositoryOpen: boolean;
  onInputChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onThemeChange: (theme: ThemePreset) => void;
  onClearCache: () => void;
  onLoad: () => void;
  onToggleRepository: () => void;
};

const themeOptions: Array<{ label: string; value: ThemePreset }> = [
  { label: "Тёмная", value: "dark" },
  { label: "Светлая", value: "light" },
  { label: "IDE", value: "jetbrains" },
];

const formatRate = (rateLimit?: RateLimitInfo): string | undefined => {
  if (rateLimit?.remaining === undefined || rateLimit.limit === undefined) {
    return undefined;
  }

  return `${rateLimit.remaining}/${rateLimit.limit} запросов`;
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
  repositoryOpen,
  onInputChange,
  onTokenChange,
  onBranchChange,
  onThemeChange,
  onClearCache,
  onLoad,
  onToggleRepository,
}: CommandBarProps) => {
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onLoad();
  };
  const rateLabel = formatRate(rateLimit);

  return (
    <header className="command-bar" data-od-id="application-header">
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">
          <BranchMarkIcon />
        </span>
        <div>
          <h1>Git Analyzer</h1>
          <p>chronograph / 01</p>
        </div>
      </div>

      <form className="repo-form" onSubmit={submit}>
        <label className="repo-input">
          <span className="sr-only">Репозиторий</span>
          <input
            aria-label="Репозиторий GitHub"
            onChange={(event) => onInputChange(event.target.value)}
            placeholder="owner/repository"
            value={input}
          />
        </label>
        <label className="branch-picker">
          <span className="sr-only">Ветка</span>
          <select
            aria-label="Ветка"
            disabled={isLoading || branches.length === 0}
            onChange={(event) => onBranchChange(event.target.value)}
            value={selectedBranch ?? repository.branch}
          >
            {branches.length > 0 ? (
              branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                  {branch.isDefault ? " · default" : ""}
                </option>
              ))
            ) : (
              <option value={repository.branch}>{repository.branch}</option>
            )}
          </select>
        </label>
        <button
          className="load-button"
          data-od-id="load-repository"
          disabled={isLoading}
          type="submit"
        >
          {isLoading ? "Загрузка…" : "Загрузить"}
        </button>
      </form>

      <div className="source-status" aria-live="polite">
        <span className="source-label">Источник · {modeLabel}</span>
        <strong>
          <i aria-hidden="true" />
          {repository.owner}/{repository.name}
        </strong>
      </div>

      <button
        aria-expanded={repositoryOpen}
        className="repository-toggle"
        data-od-id="repository-mobile-toggle"
        onClick={onToggleRepository}
        type="button"
      >
        Репозиторий
      </button>

      <details className="utility-menu">
        <summary>Настройки</summary>
        <div className="utility-popover">
          <label className="token-input">
            <span>GitHub token</span>
            <input
              autoComplete="off"
              onChange={(event) => onTokenChange(event.target.value)}
              placeholder="Необязательно"
              type="password"
              value={token}
            />
          </label>
          <div className="theme-field">
            <span>Тема</span>
            <div className="theme-switch" aria-label="Тема" role="group">
              {themeOptions.map((option) => (
                <button
                  aria-pressed={theme === option.value}
                  className={theme === option.value ? "is-selected" : ""}
                  key={option.value}
                  onClick={() => onThemeChange(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {rateLabel ? <span className="rate-label">{rateLabel}</span> : null}
          <button
            className="cache-button"
            onClick={onClearCache}
            type="button"
          >
            Очистить кэш
          </button>
        </div>
      </details>
    </header>
  );
};
