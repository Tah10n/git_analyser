import { getChangeTone } from "../lib/buildTree";
import type { CommitGraph, ExplorerCommit } from "../types";
import { GitGrowthGraph } from "./GitGrowthGraph";

type CommitPanelProps = {
  commits: ExplorerCommit[];
  currentIndex: number;
  graph?: CommitGraph;
  isLoading: boolean;
  onSelect: (index: number) => void;
};

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat("ru", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(date));

const parentLabel = (commit: ExplorerCommit) => {
  const parents = commit.parents ?? commit.parentShas;
  return parents.length > 0
    ? parents.map((parent) => parent.slice(0, 7)).join(" + ")
    : "корневой";
};

export const CommitPanel = ({
  commits,
  currentIndex,
  graph,
  isLoading,
  onSelect,
}: CommitPanelProps) => {
  const commit = commits[currentIndex] ?? commits.at(-1);
  if (!commit) return null;

  const branchMembership = commit.branches ?? [commit.branch];
  const refs = commit.refs ?? [];

  return (
    <>
      <section className="history-view" data-od-id="history-history-view">
        <header className="history-view-header">
          <div>
            <span className="eyebrow">
              Выбранный коммит · {commit.branch}
            </span>
            <h1 data-od-id="selected-commit-heading">{commit.title}</h1>
          </div>
          <span className="position">
            {currentIndex + 1} / {commits.length}
          </span>
        </header>

        <GitGrowthGraph
          commits={commits}
          currentIndex={currentIndex}
          graph={graph}
          isLoading={isLoading}
          onSelect={onSelect}
        />

        <section className="commit-content" data-od-id="changed-files">
          <div className="section-heading">
            <h2>Изменения в этом коммите</h2>
            <span>Изменений: {commit.changes.length}</span>
          </div>
          <div className="change-list" aria-label="Изменённые файлы">
            {commit.changes.length > 0 ? (
              commit.changes.map((change) => (
                <article
                  className={`change-row is-${change.status}`}
                  data-od-id={`change-${commit.shortHash}-${change.path
                    .replace(/[^a-z0-9]+/gi, "-")
                    .toLowerCase()}`}
                  key={`${change.status}-${change.path}`}
                >
                  <span className="change-status">
                    {getChangeTone(change.status)}
                  </span>
                  <div>
                    <strong>{change.path}</strong>
                    {change.previousPath ? (
                      <small>из {change.previousPath}</small>
                    ) : null}
                    <p>{change.summary}</p>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">В коммите нет изменений файлов.</div>
            )}
          </div>
        </section>
      </section>

      <aside className="commit-inspector" data-od-id="commit-inspector">
        <div className="inspector-heading">
          <span className="eyebrow">Инспектор</span>
          <h2>Метаданные коммита</h2>
          <span className="hash-badge">{commit.shortHash}</span>
        </div>
        <dl className="metadata">
          <div>
            <dt>Автор</dt>
            <dd>{commit.author}</dd>
          </div>
          <div>
            <dt>Дата</dt>
            <dd>{formatDate(commit.date)}</dd>
          </div>
          <div>
            <dt>Ветка</dt>
            <dd>{commit.branch}</dd>
          </div>
          <div>
            <dt>Родитель</dt>
            <dd>{parentLabel(commit)}</dd>
          </div>
        </dl>
        {branchMembership.length > 1 || refs.length > 0 ? (
          <div className="refs">
            <h3>Ссылки</h3>
            <p>
              {[...branchMembership, ...refs].filter(Boolean).join(" · ")}
            </p>
          </div>
        ) : null}
        <div className="inspector-notes">
          <h3>Контекст</h3>
          <p>
            Дерево файлов подсвечивает пути выбранного коммита. Граф показывает
            родителей, ответвления и точки слияния в текущем окне истории.
          </p>
        </div>
      </aside>
    </>
  );
};
