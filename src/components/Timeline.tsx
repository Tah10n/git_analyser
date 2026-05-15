import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "./icons";
import type { ExplorerCommit } from "../types";

type TimelineProps = {
  commits: ExplorerCommit[];
  currentIndex: number;
  isPlaying: boolean;
  speed: number;
  onSelect: (index: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onTogglePlayback: () => void;
  onSpeedChange: (speed: number) => void;
};

const speedOptions = [0.75, 1, 1.5, 2];

export const Timeline = ({
  commits,
  currentIndex,
  isPlaying,
  speed,
  onSelect,
  onPrevious,
  onNext,
  onTogglePlayback,
  onSpeedChange,
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
  </section>
);
