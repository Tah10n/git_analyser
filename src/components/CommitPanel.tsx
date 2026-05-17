import type { ExplorerCommit } from "../types";
import { getChangeTone } from "../lib/buildTree";

type CommitPanelProps = {
  commit: ExplorerCommit;
  index: number;
  total: number;
};

const formatDate = (date: string): string =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

export const CommitPanel = ({ commit, index, total }: CommitPanelProps) => {
  const branchMembership = commit.branches ?? [commit.branch];
  const refs = commit.refs ?? [];

  return (
    <aside className="panel commit-panel">
      <div className="panel-header">
        <div>
          <h2>Commit Details</h2>
          <p>
            {index + 1} of {total}
          </p>
        </div>
        <span className="hash-badge">{commit.shortHash}</span>
      </div>

      <div className="commit-card">
        <div className="commit-meta">
          <span>{commit.author}</span>
          <span>{formatDate(commit.date)}</span>
          <span>{commit.branch}</span>
          {branchMembership.length > 1 ? (
            <span>{branchMembership.join(", ")}</span>
          ) : null}
          {refs.length > 0 ? <span>{refs.join(", ")}</span> : null}
        </div>
        <h3>{commit.message}</h3>
      </div>

      <div className="change-list" aria-label="Changed files">
        {commit.changes.map((change) => (
          <div
            className={`change-row is-${change.status}`}
            key={`${change.status}-${change.path}`}
          >
            <span className="change-status">{getChangeTone(change.status)}</span>
            <div>
              <strong>{change.path}</strong>
              {change.previousPath ? <small>from {change.previousPath}</small> : null}
              <p>{change.summary}</p>
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
};
