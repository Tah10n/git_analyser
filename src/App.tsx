import { useEffect, useMemo, useState } from "react";
import { CommitPanel } from "./components/CommitPanel";
import { FileTree } from "./components/FileTree";
import { BranchMarkIcon } from "./components/icons";
import { Timeline } from "./components/Timeline";
import { commits, repository } from "./data/history";
import { buildTree } from "./lib/buildTree";

const playbackMs = (speed: number) => Math.round(1500 / speed);

export const App = () => {
  const [currentIndex, setCurrentIndex] = useState(commits.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const currentCommit = commits[currentIndex];
  const tree = useMemo(
    () => buildTree(currentCommit.snapshot, currentCommit.changes),
    [currentCommit],
  );

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const interval = window.setInterval(() => {
      setCurrentIndex((index) => {
        if (index >= commits.length - 1) {
          return 0;
        }

        return index + 1;
      });
    }, playbackMs(speed));

    return () => window.clearInterval(interval);
  }, [isPlaying, speed]);

  const selectCommit = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(false);
  };

  const goPrevious = () => {
    selectCommit(Math.max(currentIndex - 1, 0));
  };

  const goNext = () => {
    selectCommit(Math.min(currentIndex + 1, commits.length - 1));
  };

  return (
    <main className="app-shell">
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
        <label className="repo-input">
          <span>Repository</span>
          <input readOnly value={repository.url} />
        </label>
        <div className="status-cluster">
          <span>Branch {repository.branch}</span>
          <span>Static data</span>
        </div>
      </header>

      <section className="explorer-layout">
        <FileTree nodes={tree} />
        <CommitPanel commit={currentCommit} index={currentIndex} total={commits.length} />
      </section>

      <Timeline
        commits={commits}
        currentIndex={currentIndex}
        isPlaying={isPlaying}
        onNext={goNext}
        onPrevious={goPrevious}
        onSelect={selectCommit}
        onSpeedChange={setSpeed}
        onTogglePlayback={() => setIsPlaying((playing) => !playing)}
        speed={speed}
      />
    </main>
  );
};
