import { useState } from "react";
import {
  RiFolderFill,
  RiFolderOpenFill,
  RiMarkdownFill,
  RiFileTextLine,
} from "@remixicon/react";
import type { TreeNode } from "../api.ts";

const ICON_SIZE = 14;

interface Props {
  nodes: TreeNode[];
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

export function FileTree({ nodes, selectedPath, onSelectFile }: Props): React.ReactElement {
  return (
    <ul className="file-tree">
      {nodes.map((node) => (
        <TreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          onSelectFile={onSelectFile}
        />
      ))}
    </ul>
  );
}

interface ItemProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
}

function TreeItem({ node, depth, selectedPath, onSelectFile }: ItemProps): React.ReactElement {
  const [open, setOpen] = useState(depth < 1);

  if (node.type === "dir") {
    const FolderIcon = open ? RiFolderOpenFill : RiFolderFill;
    return (
      <li>
        <button
          type="button"
          className="tree-row tree-row--dir"
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => setOpen((v) => !v)}
        >
          <FolderIcon size={ICON_SIZE} className="tree-icon tree-icon--dir" />
          <span className="tree-label">{node.name}</span>
        </button>
        {open && node.children && node.children.length > 0 && (
          <ul className="file-tree">
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                onSelectFile={onSelectFile}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isMd = node.name.endsWith(".md");
  const isSelected = selectedPath === node.path;
  const FileIcon = isMd ? RiMarkdownFill : RiFileTextLine;
  return (
    <li>
      <button
        type="button"
        className={`tree-row tree-row--file${isSelected ? " tree-row--active" : ""}${isMd ? " tree-row--md" : ""}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        onClick={() => onSelectFile(node.path)}
      >
        <FileIcon
          size={ICON_SIZE}
          className={`tree-icon ${isMd ? "tree-icon--md" : "tree-icon--file"}`}
        />
        <span className="tree-label">{node.name}</span>
      </button>
    </li>
  );
}
