import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { CommitGraph, ExplorerCommit } from "../types";

type Projection = "3d" | "2d";

type GitGrowthGraphProps = {
  commits: ExplorerCommit[];
  currentIndex: number;
  graph?: CommitGraph;
  isLoading: boolean;
  onSelect: (index: number) => void;
};

type GraphNode = {
  commit: ExplorerCommit;
  depth: number;
  index: number;
  radius: number;
  screenX: number;
  screenY: number;
  x: number;
  y: number;
  z: number;
};

type GraphEdge = {
  child: number;
  parent: number;
};

type ViewState = {
  pitch: number;
  yaw: number;
  zoom: number;
};

const defaultView: ViewState = {
  pitch: 0.42,
  yaw: -0.38,
  zoom: 1,
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const easeOut = (value: number) => 1 - (1 - value) ** 3;

const spring = (value: number) =>
  value >= 1
    ? 1
    : 1 - Math.exp(-7 * value) * Math.cos(value * 10.5);

export const createGraphModel = (
  commits: ExplorerCommit[],
  graph?: CommitGraph,
): { edges: GraphEdge[]; nodes: GraphNode[]; parents: number[][] } => {
  const commitIndex = new Map(
    commits.map((commit, index) => [commit.id, index]),
  );
  const sourceEdges =
    graph?.edges ??
    commits.flatMap((commit) =>
      (commit.parents ?? commit.parentShas).map((parent) => ({
        from: commit.id,
        to: parent,
      })),
    );
  const edges = sourceEdges
    .map((edge) => ({
      child: commitIndex.get(edge.from) ?? -1,
      parent: commitIndex.get(edge.to) ?? -1,
    }))
    .filter((edge) => edge.child >= 0 && edge.parent >= 0);
  const parents = commits.map(() => [] as number[]);

  edges.forEach((edge) => {
    parents[edge.child]?.push(edge.parent);
  });

  const branchLanes = new Map<string, number>([["main", 0]]);
  commits.forEach((commit) => {
    if (!branchLanes.has(commit.branch)) {
      branchLanes.set(commit.branch, branchLanes.size);
    }
  });

  const nodes = commits.map((commit, index) => {
    const lane = branchLanes.get(commit.branch) ?? 0;
    const direction = lane === 0 ? 0 : lane % 2 ? -1 : 1;

    return {
      commit,
      depth: 0,
      index,
      radius: 0,
      screenX: 0,
      screenY: 0,
      x: index - (commits.length - 1) / 2,
      y: direction * lane * 1.18,
      z: lane === 0 ? Math.sin(index * 0.9) * 0.14 : 0.72 + lane * 0.18,
    };
  });

  return { edges, nodes, parents };
};

const collectAncestors = (index: number, parents: number[][]) => {
  const result = new Set<number>();
  const visit = (candidate: number) => {
    if (candidate < 0 || result.has(candidate)) return;
    result.add(candidate);
    parents[candidate]?.forEach(visit);
  };

  visit(index);
  return result;
};

export const GitGrowthGraph = ({
  commits,
  currentIndex,
  graph,
  isLoading,
  onSelect,
}: GitGrowthGraphProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => undefined);
  const growthFrameRef = useRef<number | undefined>(undefined);
  const projectionFrameRef = useRef<number | undefined>(undefined);
  const growthRef = useRef(0);
  const projectionMixRef = useRef(1);
  const viewRef = useRef<ViewState>({ ...defaultView });
  const pointerRef = useRef<
    | {
        id: number;
        moved: boolean;
        startX: number;
        startY: number;
        x: number;
        y: number;
      }
    | undefined
  >(undefined);
  const [projection, setProjection] = useState<Projection>("3d");
  const model = useMemo(
    () => createGraphModel(commits, graph),
    [commits, graph],
  );
  const activePath = useMemo(
    () => collectAncestors(currentIndex, model.parents),
    [currentIndex, model.parents],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (
      canvas.width !== Math.round(width * ratio) ||
      canvas.height !== Math.round(height * ratio)
    ) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    const styles = getComputedStyle(document.documentElement);
    const colors = {
      accent: styles.getPropertyValue("--accent").trim(),
      border: styles.getPropertyValue("--border-strong").trim(),
      fg: styles.getPropertyValue("--fg").trim(),
      info: styles.getPropertyValue("--info").trim(),
      muted: styles.getPropertyValue("--muted").trim(),
      surface: styles.getPropertyValue("--surface").trim(),
    };
    const mono = styles.getPropertyValue("--font-mono").trim();
    const usableWidth = Math.max(220, width - 116);
    const usableHeight = Math.max(120, height - 88);
    const horizontalUnit =
      usableWidth / Math.max(commits.length - 1, 1);
    const verticalUnit = Math.min(usableHeight / 2.5, horizontalUnit * 0.82);
    const view = viewRef.current;
    const cosYaw = Math.cos(view.yaw);
    const sinYaw = Math.sin(view.yaw);
    const cosPitch = Math.cos(view.pitch);
    const sinPitch = Math.sin(view.pitch);

    const projected = model.nodes.map((node) => {
      const rotatedX = node.x * cosYaw - node.z * sinYaw;
      const yawDepth = node.x * sinYaw + node.z * cosYaw;
      const rotatedY = node.y * cosPitch - yawDepth * sinPitch;
      const rotatedDepth = node.y * sinPitch + yawDepth * cosPitch;
      const perspective = clamp(1 / (1 + rotatedDepth * 0.075), 0.72, 1.3);
      const perspectivePoint = {
        depth: rotatedDepth,
        scale: perspective,
        x: width / 2 + rotatedX * horizontalUnit * view.zoom * perspective,
        y: height / 2 + rotatedY * verticalUnit * view.zoom * perspective,
      };
      const flatPoint = {
        depth: node.y,
        scale: 1,
        x: width / 2 + node.x * horizontalUnit * view.zoom,
        y: height / 2 + node.y * verticalUnit * 0.82 * view.zoom,
      };
      const mix = projectionMixRef.current;
      const point = {
        depth:
          flatPoint.depth +
          (perspectivePoint.depth - flatPoint.depth) * mix,
        scale:
          flatPoint.scale +
          (perspectivePoint.scale - flatPoint.scale) * mix,
        x: flatPoint.x + (perspectivePoint.x - flatPoint.x) * mix,
        y: flatPoint.y + (perspectivePoint.y - flatPoint.y) * mix,
      };

      node.screenX = point.x;
      node.screenY = point.y;
      node.depth = point.depth;
      return point;
    });

    if (projectionMixRef.current > 0.08) {
      context.save();
      context.lineWidth = 1;
      context.strokeStyle = colors.border;
      context.globalAlpha = 0.14 * projectionMixRef.current;
      [-1, 0, 1].forEach((offset) => {
        context.beginPath();
        context.moveTo(38, height / 2 + offset * 46);
        context.lineTo(width - 38, height / 2 + offset * 46);
        context.stroke();
      });
      context.restore();
    }

    const curvePoint = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      progress: number,
    ) => {
      const curve = Math.max(24, Math.abs(end.x - start.x) * 0.34);
      const controlA = { x: start.x + curve, y: start.y };
      const controlB = { x: end.x - curve, y: end.y };
      const inverse = 1 - progress;

      return {
        x:
          inverse ** 3 * start.x +
          3 * inverse ** 2 * progress * controlA.x +
          3 * inverse * progress ** 2 * controlB.x +
          progress ** 3 * end.x,
        y:
          inverse ** 3 * start.y +
          3 * inverse ** 2 * progress * controlA.y +
          3 * inverse * progress ** 2 * controlB.y +
          progress ** 3 * end.y,
      };
    };

    const drawCurve = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      progress: number,
      color: string,
      lineWidth: number,
      alpha: number,
    ) => {
      const steps = 28;
      const visibleSteps = Math.max(1, Math.ceil(steps * progress));
      context.beginPath();
      context.moveTo(start.x, start.y);
      for (let step = 1; step <= visibleSteps; step += 1) {
        const point = curvePoint(start, end, (step / steps) * progress);
        context.lineTo(point.x, point.y);
      }
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = lineWidth;
      context.strokeStyle = color;
      context.globalAlpha = alpha;
      context.stroke();
      context.globalAlpha = 1;
    };

    model.edges
      .slice()
      .sort(
        (left, right) =>
          projected[left.parent].depth +
          projected[left.child].depth -
          projected[right.parent].depth -
          projected[right.child].depth,
      )
      .forEach((edge) => {
        const reveal = clamp(growthRef.current - edge.child, 0, 1);
        if (!reveal) return;
        const isActive =
          activePath.has(edge.parent) && activePath.has(edge.child);
        if (isActive) {
          drawCurve(
            projected[edge.parent],
            projected[edge.child],
            reveal,
            colors.accent,
            8,
            0.08,
          );
        }
        drawCurve(
          projected[edge.parent],
          projected[edge.child],
          reveal,
          isActive ? colors.accent : colors.border,
          isActive ? 2 : 1.4,
          isActive ? 0.82 : 0.5,
        );
      });

    model.nodes
      .slice()
      .sort((left, right) => left.depth - right.depth)
      .forEach((node) => {
        const reveal = clamp(growthRef.current - node.index, 0, 1);
        if (!reveal) {
          node.radius = 0;
          return;
        }
        const point = projected[node.index];
        const isActive = node.index === currentIndex;
        const radius =
          (isActive ? 8.5 : 5.5) *
          point.scale *
          Math.max(0, spring(reveal));
        node.radius = radius;

        if (isActive) {
          context.beginPath();
          context.arc(point.x, point.y, radius + 8, 0, Math.PI * 2);
          context.fillStyle = colors.accent;
          context.globalAlpha = 0.12;
          context.fill();
          context.globalAlpha = 1;
        }

        context.beginPath();
        context.arc(point.x, point.y, radius + 2.5, 0, Math.PI * 2);
        context.fillStyle = colors.surface;
        context.fill();

        context.beginPath();
        context.arc(point.x, point.y, radius, 0, Math.PI * 2);
        context.fillStyle = isActive
          ? colors.accent
          : node.commit.branch === "main"
            ? colors.fg
            : colors.info;
        context.globalAlpha = isActive ? 1 : 0.78;
        context.fill();
        context.globalAlpha = 1;

        if (isActive || (projection === "2d" && reveal >= 1)) {
          const label = isActive
            ? `${node.commit.shortHash} · ${node.commit.title}`
            : node.commit.shortHash.slice(0, 3);
          context.font = `${isActive ? 550 : 450} ${isActive ? 11 : 9}px ${mono}`;
          const labelWidth = context.measureText(label).width;
          const labelX = clamp(point.x + 12, 8, width - labelWidth - 20);
          const labelY = clamp(point.y - 17, 14, height - 18);
          if (isActive) {
            context.fillStyle = colors.surface;
            context.globalAlpha = 0.92;
            context.fillRect(
              labelX - 6,
              labelY - 10,
              labelWidth + 12,
              20,
            );
            context.globalAlpha = 1;
          }
          context.fillStyle = isActive ? colors.fg : colors.muted;
          context.textBaseline = "middle";
          context.fillText(label, labelX, labelY);
        }
      });
  }, [
    activePath,
    commits.length,
    currentIndex,
    model.edges,
    model.nodes,
    projection,
  ]);
  drawRef.current = draw;

  const animateValue = useCallback(
    (
      animationRef: { current: number | undefined },
      from: number,
      to: number,
      duration: number,
      update: (value: number) => void,
    ) => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      const startedAt = performance.now();
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const effectiveDuration = reduced ? 0 : duration;

      const tick = (now: number) => {
        const progress = effectiveDuration
          ? clamp((now - startedAt) / effectiveDuration, 0, 1)
          : 1;
        update(from + (to - from) * easeOut(progress));
        drawRef.current();
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(tick);
        } else {
          animationRef.current = undefined;
        }
      };

      animationRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  useEffect(() => {
    animateValue(
      growthFrameRef,
      growthRef.current,
      currentIndex + 1,
      480,
      (value) => {
        growthRef.current = value;
      },
    );
  }, [animateValue, currentIndex, commits.length]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => observer.disconnect();
  }, [draw]);

  useEffect(() => {
    // Canvas pixels do not inherit CSS changes. Observe the applied theme so
    // redraw runs after the root's variables change, including parent effects.
    const observer = new MutationObserver(() => drawRef.current());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (growthFrameRef.current) {
        cancelAnimationFrame(growthFrameRef.current);
      }
      if (projectionFrameRef.current) {
        cancelAnimationFrame(projectionFrameRef.current);
      }
    },
    [],
  );

  const setProjectionMode = (next: Projection) => {
    setProjection(next);
    animateValue(
      projectionFrameRef,
      projectionMixRef.current,
      next === "3d" ? 1 : 0,
      300,
      (value) => {
        projectionMixRef.current = value;
      },
    );
  };

  const resetView = () => {
    viewRef.current = { ...defaultView };
    draw();
  };

  const hitTest = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return -1;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let result = -1;
    let closest = Number.POSITIVE_INFINITY;

    model.nodes.forEach((node) => {
      const distance = Math.hypot(x - node.screenX, y - node.screenY);
      if (
        node.radius > 0 &&
        distance <= Math.max(16, node.radius + 6) &&
        distance < closest
      ) {
        result = node.index;
        closest = distance;
      }
    });

    return result;
  };

  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = {
      id: event.pointerId,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.moved =
      pointer.moved ||
      Math.abs(event.clientX - pointer.startX) > 4 ||
      Math.abs(event.clientY - pointer.startY) > 4;

    if (projection === "3d") {
      viewRef.current.yaw += deltaX * 0.007;
      viewRef.current.pitch = clamp(
        viewRef.current.pitch + deltaY * 0.007,
        -1.1,
        1.1,
      );
      draw();
    }
  };

  const handlePointerEnd = (event: PointerEvent<HTMLCanvasElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    pointerRef.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!pointer.moved) {
      const index = hitTest(event.clientX, event.clientY);
      if (index >= 0) onSelect(index);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const step = event.shiftKey ? 0.22 : 0.11;
    if (projection === "2d" && event.key === "ArrowLeft") {
      onSelect(Math.max(0, currentIndex - 1));
    } else if (projection === "2d" && event.key === "ArrowRight") {
      onSelect(Math.min(commits.length - 1, currentIndex + 1));
    } else if (projection === "3d" && event.key === "ArrowLeft") {
      viewRef.current.yaw -= step;
    } else if (projection === "3d" && event.key === "ArrowRight") {
      viewRef.current.yaw += step;
    } else if (projection === "3d" && event.key === "ArrowUp") {
      viewRef.current.pitch = clamp(
        viewRef.current.pitch - step,
        -1.1,
        1.1,
      );
    } else if (projection === "3d" && event.key === "ArrowDown") {
      viewRef.current.pitch = clamp(
        viewRef.current.pitch + step,
        -1.1,
        1.1,
      );
    } else if (event.key === "+" || event.key === "=") {
      viewRef.current.zoom = clamp(viewRef.current.zoom * 1.08, 0.72, 1.65);
    } else if (event.key === "-" || event.key === "_") {
      viewRef.current.zoom = clamp(viewRef.current.zoom * 0.92, 0.72, 1.65);
    } else if (event.key === "Home") {
      resetView();
    } else {
      return;
    }
    event.preventDefault();
    draw();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      viewRef.current.zoom = clamp(
        viewRef.current.zoom * (event.deltaY > 0 ? 0.92 : 1.08),
        0.72,
        1.65,
      );
      draw();
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [draw]);

  const firstDate = commits[0]?.date;
  const lastDate = commits.at(-1)?.date;
  const dateRange =
    firstDate && lastDate
      ? `${new Intl.DateTimeFormat("ru", {
          day: "numeric",
          month: "short",
        }).format(new Date(firstDate))} — ${new Intl.DateTimeFormat("ru", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(lastDate))}`
      : "";

  return (
    <section className="history-band" data-od-id="commit-history-band">
      <div className="history-band-head">
        <span>
          История ветки <strong>{commits[currentIndex]?.branch}</strong>
        </span>
        <span>{dateRange}</span>
      </div>
      <div
        className={`git-graph-shell ${isLoading ? "is-loading" : ""}`}
        data-graph-projection={projection}
        data-od-id="git-growth-graph"
      >
        <div className="git-graph-toolbar" data-od-id="git-graph-controls">
          <div
            className="projection-switch"
            aria-label="Проекция графа"
            role="group"
          >
            <button
              aria-pressed={projection === "3d"}
              data-od-id="graph-projection-3d"
              onClick={() => setProjectionMode("3d")}
              type="button"
            >
              Объём
            </button>
            <button
              aria-pressed={projection === "2d"}
              data-od-id="graph-projection-2d"
              onClick={() => setProjectionMode("2d")}
              type="button"
            >
              2D
            </button>
          </div>
          <span className="graph-hint">
            {projection === "3d" ? (
              <>
                <strong>Перетащите</strong>, чтобы вращать · колесо меняет
                масштаб
              </>
            ) : (
              <>
                <strong>Выберите узел</strong> или двигайтесь нижним ползунком
              </>
            )}
          </span>
          <button
            className="git-graph-reset"
            data-od-id="graph-reset-view"
            onClick={resetView}
            type="button"
          >
            Сбросить вид
          </button>
        </div>
        <div className="git-graph-stage">
          <canvas
            aria-describedby="git-graph-description"
            aria-label={
              projection === "3d"
                ? "Трёхмерный граф коммитов. Перетаскивайте для вращения, используйте стрелки для поворота, плюс и минус для масштаба."
                : "Двухмерный граф коммитов. Используйте стрелки влево и вправо для выбора коммита."
            }
            data-od-id="git-growth-canvas"
            onKeyDown={handleKeyDown}
            onPointerCancel={handlePointerEnd}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            ref={canvasRef}
            tabIndex={0}
          >
            Интерактивный граф истории коммитов.
          </canvas>
          <div className="git-graph-legend" aria-hidden="true">
            <span className="is-active">
              <i />
              выбранный путь
            </span>
            <span>
              <i />
              ответвление
            </span>
          </div>
          {isLoading ? (
            <div className="git-graph-state" role="status">
              Перестраиваем граф…
            </div>
          ) : null}
        </div>
        <p className="sr-only" id="git-graph-description">
          Нижний ползунок раскрывает историю по коммитам. В объёмном режиме
          граф можно вращать мышью, касанием или стрелками клавиатуры. В режиме
          2D ветки показаны как фиксированные дорожки.
        </p>
      </div>
    </section>
  );
};
