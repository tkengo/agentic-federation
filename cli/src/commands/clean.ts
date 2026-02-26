import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { ARCHIVE_DIR } from "../lib/paths.js";
import { readMeta } from "../lib/session.js";
import type { RepoConfig } from "../lib/types.js";
import { loadRepoConfig } from "../lib/repo.js";

interface CleanTarget {
  sessionDir: string;
  worktreePath: string;
  repoRoot: string;
  branch: string;
  label: string;
}

function findCleanTargets(): CleanTarget[] {
  const targets: CleanTarget[] = [];

  if (!fs.existsSync(ARCHIVE_DIR)) return targets;

  const repos = fs.readdirSync(ARCHIVE_DIR);
  for (const repo of repos) {
    const repoDir = path.join(ARCHIVE_DIR, repo);
    if (!fs.statSync(repoDir).isDirectory()) continue;

    const sessions = fs.readdirSync(repoDir);
    for (const sessionDirName of sessions) {
      const sessionDir = path.join(repoDir, sessionDirName);
      if (!fs.statSync(sessionDir).isDirectory()) continue;

      const meta = readMeta(sessionDir);
      if (!meta) continue;
      if (!meta.worktree || !fs.existsSync(meta.worktree)) continue;

      // Load repo config to get repo_root for git worktree remove
      let config: RepoConfig | null = null;
      try {
        config = loadRepoConfig(meta.repo);
      } catch {
        // Repo config might not exist anymore
      }

      if (!config) continue;

      targets.push({
        sessionDir,
        worktreePath: meta.worktree,
        repoRoot: config.repo_root,
        branch: meta.branch,
        label: `${meta.repo}/${meta.branch}`,
      });
    }
  }

  return targets;
}

export function cleanCommand(dryRun: boolean, force: boolean): void {
  const targets = findCleanTargets();

  if (targets.length === 0) {
    console.log("No worktrees to clean up.");
    return;
  }

  console.log(`Found ${targets.length} worktree(s) to clean:`);

  for (const target of targets) {
    console.log(`  ${target.label}: ${target.worktreePath}`);

    if (dryRun) continue;

    // Check for uncommitted changes
    try {
      const status = execSync(`git -C '${target.worktreePath}' status --porcelain`, {
        encoding: "utf-8",
      }).trim();

      if (status && !force) {
        console.log(`    Skipped: uncommitted changes (use --force to override)`);
        continue;
      }
    } catch {
      // git status failed, worktree might be broken
    }

    // Remove worktree via git
    try {
      const forceFlag = force ? " --force" : "";
      execSync(
        `git -C '${target.repoRoot}' worktree remove '${target.worktreePath}'${forceFlag}`,
        { stdio: "inherit" }
      );
      console.log(`    Removed worktree`);
    } catch {
      console.error(`    Warning: git worktree remove failed for ${target.worktreePath}`);
      // Fallback: try to remove the directory directly with force
      if (force) {
        try {
          fs.rmSync(target.worktreePath, { recursive: true, force: true });
          // Also prune worktree references
          execSync(`git -C '${target.repoRoot}' worktree prune`, {
            stdio: "ignore",
          });
          console.log(`    Force-removed directory and pruned`);
        } catch (err) {
          console.error(`    Error: ${err}`);
        }
      }
    }

    // Delete the branch associated with the worktree
    try {
      const forceFlag = force ? " -D" : " -d";
      execSync(
        `git -C '${target.repoRoot}' branch${forceFlag} '${target.branch}'`,
        { stdio: "inherit" }
      );
      console.log(`    Deleted branch: ${target.branch}`);
    } catch {
      console.error(`    Warning: could not delete branch ${target.branch}`);
    }

    // Cleanup Claude project data for this worktree
    cleanupClaudeProject(target.worktreePath);
  }

  if (dryRun) {
    console.log("\n(dry run - no changes made)");
  } else {
    console.log("Done.");
  }
}

// Remove Claude project data for a specific worktree path
function cleanupClaudeProject(worktreePath: string): void {
  const projectsBase = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(projectsBase)) return;

  // Encode the worktree path to match Claude's directory naming convention
  const encoded = worktreePath
    .replace(/\//g, "-")
    .replace(/_/g, "-")
    .replace(/^-/, "");

  try {
    const dirs = fs.readdirSync(projectsBase);
    for (const dir of dirs) {
      if (dir === `-${encoded}` || dir === encoded) {
        const dirPath = path.join(projectsBase, dir);
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`    Cleaned Claude project data: ${dir}`);
      }
    }
  } catch {
    // Ignore errors reading project dirs
  }
}
