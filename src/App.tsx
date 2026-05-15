import { useEffect, useMemo, useState } from "react";
import { CommandBar } from "./components/CommandBar";
import { CommitPanel } from "./components/CommitPanel";
import { FileTree } from "./components/FileTree";
import { StatusBanner } from "./components/StatusBanner";
import { Timeline } from "./components/Timeline";
import { commits, repository } from "./data/history";
import { useRepositoryHistory } from "./hooks/useRepositoryHistory";
import { buildTree } from "./lib/buildTree";

const playbackMs = (speed: number) => Math.round(1500 / speed);

export const App = () => {
  const history = useRepositoryHistory(repository.url);
  const activeCommits = history.commits.length > 0 ? history.commits : commits;
  const activeRepository = history.repository ?? repository;
  const [currentIndex, setCurrentIndex] = useState(activeCommits.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const currentCommit = activeCommits[currentIndex] ?? activeCommits[0];
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
        if (index >= activeCommits.length - 1) {
          return 0;
        }

        return index + 1;
      });
    }, playbackMs(speed));

    return () => window.clearInterval(interval);
  }, [activeCommits.length, isPlaying, speed]);

  useEffect(() => {
    setCurrentIndex(activeCommits.length - 1);
    setIsPlaying(false);
  }, [activeCommits]);

  const selectCommit = (index: number) => {
    setCurrentIndex(index);
    setIsPlaying(false);
  };

  const goPrevious = () => {
    selectCommit(Math.max(currentIndex - 1, 0));
  };

  const goNext = () => {
    selectCommit(Math.min(currentIndex + 1, activeCommits.length - 1));
  };

  const modeLabel = history.commits.length > 0 ? "Live API" : "Demo data";

  return (
    <main className="app-shell">
      <CommandBar
        input={history.input}
        isLoading={history.status === "loading"}
        modeLabel={modeLabel}
        onInputChange={history.setInput}
        onLoad={history.load}
        onTokenChange={history.setToken}
        rateLimit={history.rateLimit}
        repository={activeRepository}
        token={history.token}
      />

      <StatusBanner status={history.status} error={history.error} />

      <section className="explorer-layout">
        <FileTree nodes={tree} />
        <CommitPanel commit={currentCommit} index={currentIndex} total={activeCommits.length} />
      </section>

      <Timeline
        commits={activeCommits}
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
