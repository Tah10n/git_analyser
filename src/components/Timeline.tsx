import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";
import type { ExplorerCommit } from "../types";

type TimelineProps = {
  commits: ExplorerCommit[];
  currentIndex: number;
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

export const Timeline = ({
  commits,
  currentIndex,
  isPlaying,
  speed,
  exportState,
  onSelect,
  onPrevious,
  onNext,
  onTogglePlayback,
  onSpeedChange,
  onExport,
}: TimelineProps) => (
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
            style={{ left: `${(index / (commits.length - 1)) * 100}%` }}
            tabIndex={-1}
            type="button"
          />
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
