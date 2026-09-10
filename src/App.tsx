import { useEffect, useMemo, useRef, useState } from "react";
import { CommandBar } from "./components/CommandBar";
import { CommitPanel } from "./components/CommitPanel";
import { FileTree } from "./components/FileTree";
import { StatusBanner } from "./components/StatusBanner";
import { Timeline } from "./components/Timeline";
import { branches, commits, repository } from "./data/history";
import { useRepositoryHistory } from "./hooks/useRepositoryHistory";
import { getBranchScopedCommits, getPreservedCommitIndex } from "./lib/branches";
import { buildTree } from "./lib/buildTree";
import { recordTimelineWebm } from "./lib/exportVideo";
import type { ThemePreset } from "./types";

const playbackMs = (speed: number) => Math.round(1500 / speed);

type ExportState =
  | { status: "idle"; progress: number; url?: undefined; error?: undefined }
  | { status: "recording"; progress: number; url?: undefined; error?: undefined }
  | { status: "ready"; progress: number; url: string; error?: undefined }
  | { status: "error"; progress: number; url?: undefined; error: string };

export const App = () => {
  const history = useRepositoryHistory(repository.url);
  const selectedBranch = history.selectedBranch ?? repository.branch;
  const demoCommits = useMemo(
    () => getBranchScopedCommits(commits, selectedBranch),
    [selectedBranch],
  );
  const activeCommits =
    history.commits.length > 0
      ? history.commits
      : demoCommits.length > 0
        ? demoCommits
        : commits;
  const activeRepository = history.repository ?? {
    ...repository,
    branch: selectedBranch,
  };
  const activeBranches = history.branches.length > 0 ? history.branches : branches;
  const [currentIndex, setCurrentIndex] = useState(activeCommits.length - 1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [theme, setTheme] = useState<ThemePreset>("dark");
  const [isRepositoryOpen, setIsRepositoryOpen] = useState(false);
  const selectedCommitId = useRef<string | undefined>(undefined);
  const [exportState, setExportState] = useState<ExportState>({
    status: "idle",
    progress: 0,
  });

  const currentCommit =
    activeCommits[currentIndex] ?? activeCommits.at(-1) ?? activeCommits[0];
  const currentCommitPaths = useMemo(
    () =>
      currentCommit.changes.flatMap((change) =>
        change.previousPath ? [change.path, change.previousPath] : [change.path],
      ),
    [currentCommit],
  );
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
    const nextIndex = getPreservedCommitIndex(
      activeCommits,
      selectedCommitId.current,
    );

    setCurrentIndex(nextIndex >= 0 ? nextIndex : activeCommits.length - 1);
    setIsPlaying(false);
  }, [activeCommits]);

  useEffect(() => {
    selectedCommitId.current = currentCommit.id;
  }, [currentCommit.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    const closeRepository = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsRepositoryOpen(false);
    };
    const closeOnDesktop = () => {
      if (window.innerWidth > 820) setIsRepositoryOpen(false);
    };

    document.addEventListener("keydown", closeRepository);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.removeEventListener("keydown", closeRepository);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (exportState.url) {
        window.URL.revokeObjectURL(exportState.url);
      }
    };
  }, [exportState.url]);

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

  const exportTimeline = async () => {
    if (exportState.url) {
      window.URL.revokeObjectURL(exportState.url);
    }

    setExportState({ status: "recording", progress: 0 });

    try {
      const blob = await recordTimelineWebm(activeCommits, (progress) => {
        setExportState({ status: "recording", progress: progress.percent });
      });
      const url = window.URL.createObjectURL(blob);
      setExportState({ status: "ready", progress: 100, url });
    } catch (error) {
      setExportState({
        status: "error",
        progress: 0,
        error:
          error instanceof Error
            ? error.message
            : "Unable to export this timeline.",
      });
    }
  };

  const modeLabel = history.commits.length > 0
    ? history.source === "service" ? "Service API" : "Browser API"
    : "Demo data";

  return (
    <main className="app-shell">
      <CommandBar
        branches={activeBranches}
        input={history.input}
        isLoading={history.status === "loading"}
        modeLabel={modeLabel}
        selectedBranch={selectedBranch}
        onBranchChange={history.selectBranch}
        onInputChange={history.setInput}
        onClearCache={history.clearCache}
        onLoad={history.load}
        onTokenChange={history.setToken}
        onThemeChange={setTheme}
        onToggleRepository={() => setIsRepositoryOpen((open) => !open)}
        rateLimit={history.rateLimit}
        repository={activeRepository}
        repositoryOpen={isRepositoryOpen}
        theme={theme}
        token={history.token}
      />

      <StatusBanner
        error={history.error}
        status={history.status}
        warning={history.warning}
      />

      <section
        className={`workbench ${isRepositoryOpen ? "is-repository-open" : ""}`}
      >
        <FileTree
          changedPaths={currentCommitPaths}
          nodes={tree}
          onClose={() => setIsRepositoryOpen(false)}
        />
        <button
          aria-label="Закрыть дерево файлов"
          className="repository-scrim"
          onClick={() => setIsRepositoryOpen(false)}
          type="button"
        />
        <CommitPanel
          commits={activeCommits}
          currentIndex={currentIndex}
          graph={history.graph}
          isLoading={history.status === "loading"}
          onSelect={selectCommit}
        />
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
        onExport={exportTimeline}
        exportState={exportState}
        speed={speed}
      />
    </main>
  );
};
