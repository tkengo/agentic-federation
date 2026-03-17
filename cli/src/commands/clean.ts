import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { ACTIVE_DIR } from "../lib/paths.js";
import { log } from "../lib/logger.js";
import { resolveSession, readMeta } from "../lib/session.js";
import type { RepoConfig } from "../lib/types.js";
import { loadRepoConfig, listRepoConfigs } from "../lib/repo.js";
import { readProtectedWorktrees, parseWorktreeList } from "../lib/worktree-protect.js";

interface CleanTarget {
  worktreePath: string;
  repoRoot: string;
  branch: string;
  label: string;
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

interface CleanResult {
  targets: CleanTarget[];
  protectedCount: number;
}

export function findCleanTargets(): CleanResult {
  const targets: CleanTarget[] = [];
  const activeWorktrees = getActiveWorktreePaths();
  const protectedWorktrees = readProtectedWorktrees();
  const repoNames = listRepoConfigs();
  let protectedCount = 0;

  for (const repoName of repoNames) {
    let config: RepoConfig;
    try {
      config = loadRepoConfig(repoName);
    } catch {
      continue;
    }

    const worktrees = parseWorktreeList(config.repo_root);
    for (const wt of worktrees) {
      // Skip the main worktree (repo_root itself)
      if (wt.path === config.repo_root) continue;
      // Skip worktrees that belong to active sessions
      if (activeWorktrees.has(wt.path)) continue;
      // Skip protected worktrees
      if (protectedWorktrees.has(wt.path)) {
        protectedCount++;
        continue;
      }

      targets.push({
        worktreePath: wt.path,
        repoRoot: config.repo_root,
        branch: wt.branch,
        label: `${repoName}/${wt.branch}`,
      });
    }
  }

  return { targets, protectedCount };
}

export function cleanCommand(dryRun: boolean, force: boolean): void {
  const { targets, protectedCount } = findCleanTargets();

  if (targets.length === 0) {
    if (protectedCount > 0) {
      console.log(`No worktrees to clean up (${protectedCount} protected, skipped).`);
    } else {
      console.log("No worktrees to clean up.");
    }
    return;
  }

  const protectedNote = protectedCount > 0 ? ` (${protectedCount} protected, skipped)` : "";
  console.log(`Found ${targets.length} worktree(s) to clean${protectedNote}:`);

  let cleaned = 0;
  let skipped = 0;
  let failed = 0;

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
        skipped++;
        continue;
      }
    } catch {
      // git status failed, worktree might be broken
    }

    // Remove worktree via git
    let worktreeRemoved = false;
    try {
      const forceFlag = force ? " --force" : "";
      const cmd = `git -C '${target.repoRoot}' worktree remove '${target.worktreePath}'${forceFlag}`;
      log(`[clean] exec: ${cmd}`);
      const wtResult = execSync(cmd, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (wtResult.trim()) log(`[clean] git worktree remove stdout: ${wtResult.trim()}`);
      console.log(`    Removed worktree`);
      worktreeRemoved = true;
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      log(`[clean] git worktree remove FAILED: exit=${e.status ?? "?"} stderr=${(e.stderr ?? "").trim()} stdout=${(e.stdout ?? "").trim()}`);
      console.error(`    Warning: git worktree remove failed for ${target.worktreePath}`);
      // Fallback: try to remove the directory directly with force
      if (force) {
        try {
          fs.rmSync(target.worktreePath, { recursive: true, force: true });
          // Also prune worktree references
          const pruneCmd = `git -C '${target.repoRoot}' worktree prune`;
          log(`[clean] exec: ${pruneCmd}`);
          execSync(pruneCmd, {
            encoding: "utf-8",
            stdio: ["ignore", "pipe", "pipe"],
          });
          console.log(`    Force-removed directory and pruned`);
          worktreeRemoved = true;
        } catch (pruneErr) {
          log(`[clean] force-remove fallback FAILED: ${pruneErr}`);
          console.error(`    Error: ${pruneErr}`);
        }
      }
    }

    if (!worktreeRemoved) {
      failed++;
      continue;
    }

    // Delete the branch associated with the worktree
    try {
      const forceFlag = force ? " -D" : " -d";
      const branchCmd = `git -C '${target.repoRoot}' branch${forceFlag} '${target.branch}'`;
      log(`[clean] exec: ${branchCmd}`);
      const branchResult = execSync(branchCmd, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (branchResult.trim()) log(`[clean] git branch delete stdout: ${branchResult.trim()}`);
      console.log(`    Deleted branch: ${target.branch}`);
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; status?: number };
      log(`[clean] git branch delete FAILED: exit=${e.status ?? "?"} stderr=${(e.stderr ?? "").trim()} stdout=${(e.stdout ?? "").trim()}`);
      console.error(`    Warning: could not delete branch ${target.branch}`);
    }

    // Cleanup Claude project data for this worktree
    cleanupClaudeProject(target.worktreePath);
    cleaned++;
  }

  if (dryRun) {
    console.log("\n(dry run - no changes made)");
  } else {
    const parts: string[] = [];
    if (cleaned > 0) parts.push(`${cleaned} cleaned`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (failed > 0) parts.push(`${failed} failed`);
    console.log(`Done. ${parts.join(", ")}.`);
    if (failed > 0) {
      process.exit(1);
    }
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
