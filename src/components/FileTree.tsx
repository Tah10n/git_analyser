import { FileIcon, FolderIcon } from "./icons";
import type { TreeNode } from "../types";
import { getChangeTone } from "../lib/buildTree";

type FileTreeProps = {
  nodes: TreeNode[];
};

const TreeRow = ({ node }: { node: TreeNode }) => {
  const Icon = node.kind === "folder" ? FolderIcon : FileIcon;
  const statusLabel = node.status ? getChangeTone(node.status) : undefined;

  return (
    <>
      <li
        className={`tree-row ${node.status ? `is-${node.status}` : ""}`}
        style={{ "--depth": node.depth } as React.CSSProperties}
      >
        <span className="tree-indent" />
        <Icon className="tree-icon" />
        <span className="tree-name">{node.name}</span>
        {statusLabel ? <span className="change-pill">{statusLabel}</span> : null}
      </li>
      {node.children.length > 0
        ? node.children.map((child) => <TreeRow key={child.id} node={child} />)
        : null}
    </>
  );
};

export const FileTree = ({ nodes }: FileTreeProps) => (
  <div className="panel tree-panel">
    <div className="panel-header">
      <div>
        <h2>File Tree</h2>
        <p>{nodes.length} root entries</p>
      </div>
    </div>
    <ol className="tree-list">
      {nodes.map((node) => (
        <TreeRow key={node.id} node={node} />
      ))}
    </ol>
  </div>
);
