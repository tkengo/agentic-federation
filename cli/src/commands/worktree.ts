import os from "node:os";
import {
  listAllWorktrees,
  resolveWorktreePath,
  addProtectedWorktree,
  removeProtectedWorktree,
  isWorktreeProtected,
} from "../lib/worktree-protect.js";

function shortenHome(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

// `fed worktree list [--protected | --no-protected]`
// protectedFilter: undefined = all, true = protected only, false = unprotected only
export function worktreeListCommand(protectedFilter?: boolean): void {
  const worktrees = listAllWorktrees();

  const filtered = protectedFilter === undefined
    ? worktrees
    : worktrees.filter(wt => wt.isProtected === protectedFilter);

  if (filtered.length === 0) {
    if (protectedFilter === true) {
      console.log("No protected worktrees.");
    } else if (protectedFilter === false) {
      console.log("No unprotected worktrees.");
    } else {
      console.log("No worktrees found.");
    }
    return;
  }

  // Calculate column widths
  const colWidths = {
    repo: Math.max(4, ...filtered.map(wt => wt.repo.length)),
    branch: Math.max(6, ...filtered.map(wt => wt.branch.length)),
  };

  // Header
  console.log(
    `${"REPO".padEnd(colWidths.repo)}  ${"BRANCH".padEnd(colWidths.branch)}  PROTECTED  PATH`
  );

  for (const wt of filtered) {
    const protectedMark = wt.isProtected ? "\u{1F512}" : " -";
    const shortPath = shortenHome(wt.path);
    console.log(
      `${wt.repo.padEnd(colWidths.repo)}  ${wt.branch.padEnd(colWidths.branch)}  ${protectedMark.padEnd(9)}  ${shortPath}`
    );
  }
}

// `fed worktree protect <repo> <branch>`
export function worktreeProtectCommand(repo: string, branch: string): void {
  const wtPath = resolveWorktreePath(repo, branch);
  if (!wtPath) {
    console.error(`Error: Worktree not found: ${repo}/${branch}`);
    process.exit(1);
  }

  if (isWorktreeProtected(wtPath)) {
    console.log(`Already protected: ${repo}/${branch}`);
    return;
  }

  addProtectedWorktree(wtPath);
  console.log(`Protected: ${repo}/${branch} (${wtPath})`);
}

// `fed worktree unprotect <repo> <branch>`
export function worktreeUnprotectCommand(repo: string, branch: string): void {
  const wtPath = resolveWorktreePath(repo, branch);
  if (!wtPath) {
    console.error(`Error: Worktree not found: ${repo}/${branch}`);
    process.exit(1);
  }

  const removed = removeProtectedWorktree(wtPath);
  if (!removed) {
    console.error(`Error: Not protected: ${repo}/${branch}`);
    process.exit(1);
  }

  console.log(`Unprotected: ${repo}/${branch} (${wtPath})`);
}
