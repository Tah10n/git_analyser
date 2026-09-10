import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { getChangeTone } from "../lib/buildTree";
import type { TreeNode } from "../types";
import { ChevronRightIcon, FileIcon, FolderIcon } from "./icons";

type FileTreeProps = {
  changedPaths: string[];
  nodes: TreeNode[];
  onClose?: () => void;
};

export type TreeExpansion = Map<string, boolean>;

type FlatTreeNode = TreeNode & {
  isExpanded: boolean;
};

const rowHeight = 46;
const overscan = 6;

const flattenNodes = (nodes: TreeNode[]): TreeNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);

const matchesSearch = (node: TreeNode, query: string): boolean =>
  !query || node.path.toLowerCase().includes(query.toLowerCase());

export const getAncestorPaths = (path: string): string[] => {
  const parts = path.match(/[^/]+/g) ?? [];

  return parts
    .slice(0, -1)
    .map((_, index) => parts.slice(0, index + 1).join("/"));
};

export const createAutoExpandedPaths = (paths: string[]): Set<string> =>
  new Set(paths.flatMap(getAncestorPaths));

const matchesVisibleFilters = (
  node: TreeNode,
  query: string,
  changedOnly: boolean,
): boolean =>
  matchesSearch(node, query) && (!changedOnly || Boolean(node.status));

const hasVisibleDescendant = (
  node: TreeNode,
  query: string,
  changedOnly: boolean,
): boolean =>
  matchesVisibleFilters(node, query, changedOnly) ||
  node.children.some((child) =>
    hasVisibleDescendant(child, query, changedOnly),
  );

const getSearchExpandedPaths = (nodes: TreeNode[], query: string): Set<string> => {
  if (!query) {
    return new Set();
  }

  const matchingPaths = flattenNodes(nodes)
    .filter((node) => matchesSearch(node, query))
    .map((node) => node.path);

  return createAutoExpandedPaths(matchingPaths);
};

export const isExpandedByState = (
  path: string,
  autoExpandedPaths: Set<string>,
  searchExpandedPaths: Set<string>,
  manualExpansion: TreeExpansion,
): boolean => {
  if (searchExpandedPaths.has(path)) {
    return true;
  }

  const manualValue = manualExpansion.get(path);

  return manualValue ?? autoExpandedPaths.has(path);
};

export const flattenVisibleNodes = ({
  autoExpandedPaths,
  changedOnly,
  manualExpansion,
  nodes,
  query,
  searchExpandedPaths,
}: {
  autoExpandedPaths: Set<string>;
  changedOnly: boolean;
  manualExpansion: TreeExpansion;
  nodes: TreeNode[];
  query: string;
  searchExpandedPaths: Set<string>;
}): FlatTreeNode[] => {
  const normalizedQuery = query.trim().toLowerCase();

  const visit = (node: TreeNode): FlatTreeNode[] => {
    if (!hasVisibleDescendant(node, normalizedQuery, changedOnly)) {
      return [];
    }

    const isExpanded =
      node.kind === "folder" &&
      isExpandedByState(
        node.path,
        autoExpandedPaths,
        searchExpandedPaths,
        manualExpansion,
      );
    const rows: FlatTreeNode[] = [{ ...node, isExpanded }];

    if (node.kind === "folder" && isExpanded) {
      rows.push(...node.children.flatMap(visit));
    }

    return rows;
  };

  return nodes.flatMap(visit);
};

const TreeRow = ({
  node,
  onToggle,
}: {
  node: FlatTreeNode;
  onToggle: (node: FlatTreeNode) => void;
}) => {
  const Icon = node.kind === "folder" ? FolderIcon : FileIcon;
  const statusLabel = node.status ? getChangeTone(node.status) : undefined;
  const canToggle = node.kind === "folder" && node.children.length > 0;

  return (
    <div
      aria-expanded={canToggle ? node.isExpanded : undefined}
      className={`tree-row ${node.status ? `is-${node.status}` : ""}`}
      role="treeitem"
      style={{ "--depth": node.depth } as React.CSSProperties}
    >
      <span className="tree-indent" />
      {canToggle ? (
        <button
          aria-label={`${node.isExpanded ? "Свернуть" : "Развернуть"} ${node.path}`}
          className={`tree-expander ${node.isExpanded ? "is-expanded" : ""}`}
          onClick={() => onToggle(node)}
          type="button"
        >
          <ChevronRightIcon />
        </button>
      ) : (
        <span className="tree-expander-spacer" />
      )}
      <Icon className="tree-icon" />
      <span className="tree-name">{node.name}</span>
      {statusLabel ? <span className="change-pill">{statusLabel}</span> : null}
    </div>
  );
};

export const FileTree = ({ changedPaths, nodes, onClose }: FileTreeProps) => (
  <VirtualFileTree changedPaths={changedPaths} nodes={nodes} onClose={onClose} />
);

const VirtualFileTree = ({ changedPaths, nodes, onClose }: FileTreeProps) => {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [changedOnly, setChangedOnly] = useState(false);
  const [manualExpansion, setManualExpansion] = useState<TreeExpansion>(
    () => new Map(),
  );
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const listRef = useRef<HTMLDivElement>(null);
  const flatNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const autoExpandedPaths = useMemo(
    () => createAutoExpandedPaths(changedPaths),
    [changedPaths],
  );
  const searchExpandedPaths = useMemo(
    () => getSearchExpandedPaths(nodes, normalizedQuery),
    [nodes, normalizedQuery],
  );
  const visibleNodes = useMemo(
    () =>
      flattenVisibleNodes({
        autoExpandedPaths,
        changedOnly,
        manualExpansion,
        nodes,
        query: normalizedQuery,
        searchExpandedPaths,
      }),
    [
      autoExpandedPaths,
      changedOnly,
      manualExpansion,
      nodes,
      normalizedQuery,
      searchExpandedPaths,
    ],
  );
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const rows = visibleNodes.slice(startIndex, startIndex + visibleCount);
  const totalHeight = visibleNodes.length * rowHeight;
  const offsetY = startIndex * rowHeight;

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [changedOnly, deferredQuery]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const updateHeight = () => setViewportHeight(list.clientHeight);
    const observer = new ResizeObserver(updateHeight);
    observer.observe(list);
    updateHeight();
    return () => observer.disconnect();
  }, []);

  const toggleNode = (node: FlatTreeNode) => {
    setManualExpansion((current) => {
      const next = new Map(current);
      next.set(node.path, !node.isExpanded);
      return next;
    });
  };

  return (
    <aside className="repo-rail" data-od-id="repository-file-tree">
      <div className="panel-header tree-header">
        <div>
          <span className="eyebrow">Репозиторий</span>
          <h2>Структура файлов</h2>
          <p>
            {visibleNodes.length} видно · {flatNodes.length} всего
          </p>
        </div>
        <button
          aria-label="Закрыть дерево файлов"
          className="rail-close"
          onClick={onClose}
          type="button"
        >
          Закрыть
        </button>
      </div>
      <div className="tree-tools">
        <label className="tree-search">
          <span>Поиск по пути</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Например, src/components"
            value={query}
          />
        </label>
        <label className="changed-toggle">
          <input
            checked={changedOnly}
            onChange={(event) => setChangedOnly(event.target.checked)}
            type="checkbox"
          />
          <span>Только изменённые</span>
        </label>
      </div>
      <div
        className="tree-list"
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
          setViewportHeight(event.currentTarget.clientHeight);
        }}
        ref={listRef}
        role="tree"
      >
        {visibleNodes.length > 0 ? (
          <div className="tree-virtual-spacer" style={{ height: totalHeight }}>
            <div
              className="tree-virtual-window"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {rows.map((node) => (
                <TreeRow key={node.id} node={node} onToggle={toggleNode} />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-tree">Файлы не найдены</div>
        )}
      </div>
    </aside>
  );
};
