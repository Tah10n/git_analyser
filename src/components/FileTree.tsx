import { FileIcon, FolderIcon } from "./icons";
import type { TreeNode } from "../types";
import { getChangeTone } from "../lib/buildTree";
import { useEffect, useMemo, useRef, useState } from "react";

type FileTreeProps = {
  nodes: TreeNode[];
};

const rowHeight = 34;
const overscan = 6;

const flattenNodes = (nodes: TreeNode[]): TreeNode[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children)]);

const matchesSearch = (node: TreeNode, query: string): boolean =>
  !query || node.path.toLowerCase().includes(query.toLowerCase());

const TreeRow = ({ node }: { node: TreeNode }) => {
  const Icon = node.kind === "folder" ? FolderIcon : FileIcon;
  const statusLabel = node.status ? getChangeTone(node.status) : undefined;

  return (
    <div
      className={`tree-row ${node.status ? `is-${node.status}` : ""}`}
      role="treeitem"
      style={{ "--depth": node.depth } as React.CSSProperties}
    >
      <span className="tree-indent" />
      <Icon className="tree-icon" />
      <span className="tree-name">{node.name}</span>
      {statusLabel ? <span className="change-pill">{statusLabel}</span> : null}
    </div>
  );
};

export const FileTree = ({ nodes }: FileTreeProps) => (
  <VirtualFileTree nodes={nodes} />
);

const VirtualFileTree = ({ nodes }: FileTreeProps) => {
  const [query, setQuery] = useState("");
  const [changedOnly, setChangedOnly] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(420);
  const listRef = useRef<HTMLDivElement>(null);
  const flatNodes = useMemo(() => flattenNodes(nodes), [nodes]);
  const visibleNodes = useMemo(
    () =>
      flatNodes.filter(
        (node) =>
          matchesSearch(node, query) && (!changedOnly || Boolean(node.status)),
      ),
    [changedOnly, flatNodes, query],
  );
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
  const rows = visibleNodes.slice(startIndex, startIndex + visibleCount);
  const totalHeight = visibleNodes.length * rowHeight;
  const offsetY = startIndex * rowHeight;

  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [changedOnly, query]);

  return (
    <div className="panel tree-panel">
      <div className="panel-header tree-header">
        <div>
          <h2>File Tree</h2>
          <p>
            {visibleNodes.length} visible / {flatNodes.length} total
          </p>
        </div>
        <div className="tree-tools">
          <label className="tree-search">
            <span>Search</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              value={query}
            />
          </label>
          <label className="changed-toggle">
            <input
              checked={changedOnly}
              onChange={(event) => setChangedOnly(event.target.checked)}
              type="checkbox"
            />
            <span>Changed</span>
          </label>
        </div>
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
                <TreeRow key={node.id} node={node} />
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-tree">No files match</div>
        )}
      </div>
    </div>
  );
};
