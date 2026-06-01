import fs from "node:fs";
import path from "node:path";

export interface TreeNode {
  name: string;
  path: string; // relative to root
  type: "file" | "dir";
  children?: TreeNode[];
}

const IGNORE_NAMES = new Set([
  "node_modules",
  ".git",
  ".DS_Store",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
  ".venv",
  "__pycache__",
]);

export function buildTree(root: string, maxDepth = 6): TreeNode[] {
  if (!fs.existsSync(root)) return [];
  return readDir(root, "", 0, maxDepth);
}

function readDir(absRoot: string, rel: string, depth: number, maxDepth: number): TreeNode[] {
  const absDir = path.join(absRoot, rel);
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: TreeNode[] = [];
  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue;
    if (entry.name.startsWith(".") && entry.name !== ".claude" && entry.name !== ".fed") {
      // Skip hidden files but keep .claude/.fed style fed-relevant ones
      continue;
    }
    // Skip symbolic links: a session_dir often contains a `worktree` symlink
    // pointing to the repo worktree, which is already exposed via the
    // separate "repo" tree. Showing it here would duplicate content.
    if (entry.isSymbolicLink()) continue;

    const childRel = rel ? path.join(rel, entry.name) : entry.name;

    if (entry.isDirectory()) {
      const children = depth + 1 < maxDepth ? readDir(absRoot, childRel, depth + 1, maxDepth) : [];
      nodes.push({ name: entry.name, path: childRel, type: "dir", children });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: childRel, type: "file" });
    }
  }

  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

/**
 * Safely resolve a relative path against an allowed root. Returns null if the
 * resulting absolute path escapes the root (path traversal attempt).
 */
export function resolveWithinRoot(root: string, rel: string): string | null {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  const realRoot = (() => {
    try {
      return fs.realpathSync(absRoot);
    } catch {
      return absRoot;
    }
  })();
  const realAbs = (() => {
    try {
      return fs.realpathSync(abs);
    } catch {
      return abs;
    }
  })();
  if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) {
    return null;
  }
  return realAbs;
}
