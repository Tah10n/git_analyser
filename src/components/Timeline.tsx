import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";
import type { CommitGraph, ExplorerCommit } from "../types";

type TimelineProps = {
  commits: ExplorerCommit[];
  currentIndex: number;
  graph?: CommitGraph;
  isPlaying: boolean;
  speed: number;
  exportState: {
    status: "idle" | "recording" | "ready" | "error";
    progress: number;
    url?: string;
    error?: string;
  };
  onSelect: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayback: () => void;
  onSpeedChange: (speed: number) => void;
  onExport: () => void;
};

const speedOptions = [0.75, 1, 1.5, 2];

const plural = (count: number, singular: string, pluralLabel = `${singular}s`) =>
  count === 1 ? singular : pluralLabel;

type GraphNodeRole = {
  childCount: number;
  className: string;
  id: string;
  label: string;
  parentCount: number;
};

export const getMarkerPositionPercent = (
  index: number,
  total: number,
): string => {
  if (total <= 1) {
    return "0%";
  }

  return `${(index / (total - 1)) * 100}%`;
};

export const getCommitGraphNodeRoles = (
  commits: ExplorerCommit[],
  graph?: CommitGraph,
): GraphNodeRole[] => {
  const edges =
    graph?.edges ??
    commits.flatMap((commit, index) => {
      if (commit.parents?.length) {
        return commit.parents.map((parent) => ({ from: commit.id, to: parent }));
      }

      const previousCommit = commits[index - 1];
      return previousCommit ? [{ from: commit.id, to: previousCommit.id }] : [];
    });
  const heads = new Set(graph?.heads ?? []);
  const merges = new Set(graph?.merges ?? []);
  const roots = new Set(graph?.roots ?? []);

  return commits.map((commit, index) => {
    const parentCount = edges.filter((edge) => edge.from === commit.id).length;
    const childCount = edges.filter((edge) => edge.to === commit.id).length;
    const isRoot =
      roots.has(commit.id) || (parentCount === 0 && (index === 0 || !graph));
    const isMerge = merges.has(commit.id) || parentCount > 1;
    const isHead =
      heads.has(commit.id) ||
      (!graph && index === commits.length - 1) ||
      !commits.some((candidate) =>
        edges.some((edge) => edge.from === candidate.id && edge.to === commit.id),
      );
    const roles = [
      isRoot ? "root" : undefined,
      isMerge ? "merge" : undefined,
      isHead ? "head" : undefined,
    ].filter(Boolean);
    const roleText = roles.length ? roles.join(", ") : "linear";

    return {
      childCount,
      className: [
        "graph-node",
        isRoot ? "is-root" : undefined,
        isMerge ? "is-merge" : undefined,
        isHead ? "is-head" : undefined,
      ]
        .filter(Boolean)
        .join(" "),
      id: commit.id,
      label: `${commit.shortHash}: ${roleText} commit, ${parentCount} ${plural(parentCount, "parent")}, ${childCount} ${plural(childCount, "child", "children")}`,
      parentCount,
    };
  });
};

export const Timeline = ({
  commits,
  currentIndex,
  graph,
  isPlaying,
  speed,
  exportState,
  onSelect,
  onPrevious,
  onNext,
  onTogglePlayback,
  onSpeedChange,
  onExport,
}: TimelineProps) => {
  const graphNodeRoles = getCommitGraphNodeRoles(commits, graph);

  return (
    <section className="timeline-shell" aria-label="Commit timeline">
      <div className="timeline-controls">
        <button className="icon-button" type="button" onClick={onPrevious} aria-label="Previous commit">
          <PreviousIcon />
        </button>
        <button className="play-button" type="button" onClick={onTogglePlayback}>
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>
        <button className="icon-button" type="button" onClick={onNext} aria-label="Next commit">
          <NextIcon />
        </button>
      </div>

      <div className="scrubber">
        <input
          aria-label="Selected commit"
          max={commits.length - 1}
          min={0}
          onChange={(event) => onSelect(Number(event.target.value))}
          type="range"
          value={currentIndex}
        />
        <div className="commit-markers" aria-hidden="true">
          {commits.map((commit, index) => (
            <button
              className={index === currentIndex ? "is-active" : ""}
              key={commit.id}
              onClick={() => onSelect(index)}
              style={{ left: getMarkerPositionPercent(index, commits.length) }}
              tabIndex={-1}
              type="button"
            />
          ))}
        </div>
        <div className="commit-graph" aria-label="Branch graph">
          {graphNodeRoles.map((node, index) => (
            <button
              aria-label={node.label}
              className={node.className}
              key={node.id}
              onClick={() => onSelect(index)}
              style={{ left: getMarkerPositionPercent(index, commits.length) }}
              type="button"
            >
              <span>{node.parentCount > 1 ? node.parentCount : ""}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="speed-group" aria-label="Playback speed">
        {speedOptions.map((option) => (
          <button
            className={speed === option ? "is-selected" : ""}
            key={option}
            onClick={() => onSpeedChange(option)}
            type="button"
          >
            {option}x
          </button>
        ))}
      </div>

      <div className="export-group">
        <button
          className="export-button"
          disabled={exportState.status === "recording"}
          onClick={onExport}
          type="button"
        >
          {exportState.status === "recording"
            ? `Exporting ${exportState.progress}%`
            : "Export WebM"}
        </button>
        {exportState.status === "ready" ? (
          <a className="export-link" download="git-history-explorer.webm" href={exportState.url}>
            WebM ready
          </a>
        ) : null}
        {exportState.status === "error" ? (
          <span className="export-error">{exportState.error}</span>
        ) : null}
      </div>
    </section>
  );
};
