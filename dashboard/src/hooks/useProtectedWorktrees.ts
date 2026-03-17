import { useState, useCallback } from "react";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { PROTECTED_WORKTREES_FILE, REPOS_DIR } from "../utils/types.js";
import type { ProtectedWorktreeData } from "../utils/types.js";

// Parse `git worktree list --porcelain` output (mirror of CLI logic)
function parseWorktreeListSync(
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

function loadProtectedWorktrees(): ProtectedWorktreeData[] {
  try {
    const data = JSON.parse(fs.readFileSync(PROTECTED_WORKTREES_FILE, "utf-8"));
    if (!Array.isArray(data?.paths)) return [];

    // Load all repo configs to reverse-resolve paths
    const repoConfigs: Array<{ name: string; repoRoot: string }> = [];
    if (fs.existsSync(REPOS_DIR)) {
      for (const f of fs.readdirSync(REPOS_DIR).filter(f => f.endsWith(".json"))) {
        try {
          const raw = JSON.parse(fs.readFileSync(path.join(REPOS_DIR, f), "utf-8"));
          const repoRoot = raw.repo_root ?? path.join(raw.base_path, `${raw.repo_name}-workspace`, "main");
          if (!repoRoot || typeof repoRoot !== "string") continue;
          repoConfigs.push({ name: f.replace(/\.json$/, ""), repoRoot });
        } catch { /* skip */ }
      }
    }

    const results: ProtectedWorktreeData[] = [];
    for (const wtPath of data.paths as string[]) {
      let found = false;
      for (const { name, repoRoot } of repoConfigs) {
        const worktrees = parseWorktreeListSync(repoRoot);
        const match = worktrees.find(wt => wt.path === wtPath);
        if (match) {
          results.push({ repo: name, branch: match.branch, path: wtPath });
          found = true;
          break;
        }
      }
      if (!found) {
        // Worktree no longer exists in git but still in protected list
        results.push({ repo: "?", branch: path.basename(wtPath), path: wtPath });
      }
    }

    // Sort by repo then branch
    results.sort((a, b) => {
      const rc = a.repo.localeCompare(b.repo);
      if (rc !== 0) return rc;
      return a.branch.localeCompare(b.branch);
    });

    return results;
  } catch {
    return [];
  }
}

export function useProtectedWorktrees() {
  const [worktrees, setWorktrees] = useState<ProtectedWorktreeData[]>(() => loadProtectedWorktrees());

  const refresh = useCallback(() => {
    setWorktrees(loadProtectedWorktrees());
  }, []);

  return { protectedWorktrees: worktrees, refreshProtected: refresh };
}
