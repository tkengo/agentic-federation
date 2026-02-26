import fs from "node:fs";
import path from "node:path";
import { requireSessionDir, readMeta } from "../lib/session.js";

// Get pause file paths for both session dir and worktree .agent-workspace
function getPauseFiles(): string[] {
  const sessionDir = requireSessionDir();
  const paths = [path.join(sessionDir, ".pause_stale_watcher")];

  const meta = readMeta(sessionDir);
  if (meta) {
    const workspaceDir = path.join(meta.worktree, ".agent-workspace");
    paths.push(path.join(workspaceDir, ".pause_stale_watcher"));
  }
  return paths;
}

export function stalePauseCommand(): void {
  const pauseFiles = getPauseFiles();
  for (const pauseFile of pauseFiles) {
    fs.mkdirSync(path.dirname(pauseFile), { recursive: true });
    fs.writeFileSync(pauseFile, "");
  }
  console.log("Stale watcher paused");
}

export function staleResumeCommand(): void {
  const pauseFiles = getPauseFiles();
  for (const pauseFile of pauseFiles) {
    try {
      fs.unlinkSync(pauseFile);
    } catch {
      // Already removed
    }
  }
  console.log("Stale watcher resumed");
}

export function staleStatusCommand(): void {
  const pauseFiles = getPauseFiles();
  const paused = pauseFiles.some((f) => fs.existsSync(f));
  if (paused) {
    console.log("Status: PAUSED");
  } else {
    console.log("Status: ACTIVE");
  }
}
