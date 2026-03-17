import fs from "node:fs";
import { execSync } from "node:child_process";
import { ACTIVE_DIR, PROTECTED_WORKTREES_FILE } from "./paths.js";
import { loadRepoConfig, listRepoConfigs } from "./repo.js";
import { resolveSession, readMeta } from "./session.js";

// --- Protected worktrees file management ---

interface ProtectedWorktreesJson {
  paths: string[];
}

function readProtectedFile(): string[] {
  try {
    const data = JSON.parse(
      fs.readFileSync(PROTECTED_WORKTREES_FILE, "utf-8")
    ) as ProtectedWorktreesJson;
    return Array.isArray(data?.paths) ? data.paths : [];
  } catch {
    return [];
  }
}

function writeProtectedFile(paths: string[]): void {
  const data: ProtectedWorktreesJson = { paths };
  fs.writeFileSync(PROTECTED_WORKTREES_FILE, JSON.stringify(data, null, 2) + "\n");
}

export function readProtectedWorktrees(): Set<string> {
  return new Set(readProtectedFile());
}

export function addProtectedWorktree(worktreePath: string): void {
  const paths = readProtectedFile();
  if (!paths.includes(worktreePath)) {
    paths.push(worktreePath);
    writeProtectedFile(paths);
  }
}

export function removeProtectedWorktree(worktreePath: string): boolean {
  const paths = readProtectedFile();
  const idx = paths.indexOf(worktreePath);
  if (idx === -1) return false;
  paths.splice(idx, 1);
  writeProtectedFile(paths);
  return true;
}

export function isWorktreeProtected(worktreePath: string): boolean {
  return readProtectedWorktrees().has(worktreePath);
}

// --- git worktree list parser (moved from clean.ts) ---

export function parseWorktreeList(
  repoRoot: string
): Array<{ path: string; branch: string }> {
  const entries: Array<{ path: string; branch: string }> = [];
  let output: string;
  try {
    output = execSync(`git -C '${repoRoot}' worktree list --porcelain`, {
      encoding: "utf-8",
    });
  } catch {
    return entries;
  }

  // Each worktree block is separated by a blank line
  const blocks = output.trim().split("\n\n");
  for (const block of blocks) {
    const lines = block.split("\n");
    let wtPath = "";
    let branch = "";
    let bare = false;
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        wtPath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ")) {
        // e.g. "branch refs/heads/feat-x" -> "feat-x"
        branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
      } else if (line === "bare") {
        bare = true;
      }
    }
    if (wtPath && !bare) {
      entries.push({ path: wtPath, branch });
    }
  }
  return entries;
}

// --- Worktree path resolution ---

// Resolve worktree path from repo name and branch name
export function resolveWorktreePath(repoName: string, branch: string): string | null {
  const config = loadRepoConfig(repoName);
  const worktrees = parseWorktreeList(config.repo_root);
  const match = worktrees.find(wt => wt.branch === branch);
  return match?.path ?? null;
}

// --- List all worktrees ---

export interface WorktreeInfo {
  repo: string;
  branch: string;
  path: string;
  isProtected: boolean;
  isActive: boolean;
}

// Collect worktree paths currently used by active sessions
function getActiveWorktreePaths(): Set<string> {
  const active = new Set<string>();
  if (!fs.existsSync(ACTIVE_DIR)) return active;

  for (const entry of fs.readdirSync(ACTIVE_DIR)) {
    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;
    const meta = readMeta(sessionDir);
    if (meta?.worktree) active.add(meta.worktree);
  }
  return active;
}

export function listAllWorktrees(): WorktreeInfo[] {
  const protectedSet = readProtectedWorktrees();
  const activeSet = getActiveWorktreePaths();
  const repoNames = listRepoConfigs();
  const results: WorktreeInfo[] = [];

  for (const repoName of repoNames) {
    let config;
    try {
      config = loadRepoConfig(repoName);
    } catch {
      continue;
    }

    const worktrees = parseWorktreeList(config.repo_root);
    for (const wt of worktrees) {
      // Skip the main worktree (repo_root itself)
      if (wt.path === config.repo_root) continue;

      results.push({
        repo: repoName,
        branch: wt.branch,
        path: wt.path,
        isProtected: protectedSet.has(wt.path),
        isActive: activeSet.has(wt.path),
      });
    }
  }

  // Sort by repo name then branch name
  results.sort((a, b) => {
    const repoCompare = a.repo.localeCompare(b.repo);
    if (repoCompare !== 0) return repoCompare;
    return a.branch.localeCompare(b.branch);
  });

  return results;
}
