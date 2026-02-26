import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";

function getPauseFile(): string {
  const sessionDir = requireSessionDir();
  return path.join(sessionDir, ".pause_stale_watcher");
}

export function stalePauseCommand(): void {
  const pauseFile = getPauseFile();
  fs.writeFileSync(pauseFile, "");
  console.log("Stale watcher paused");
}

export function staleResumeCommand(): void {
  const pauseFile = getPauseFile();
  try {
    fs.unlinkSync(pauseFile);
  } catch {
    // Already removed
  }
  console.log("Stale watcher resumed");
}

export function staleStatusCommand(): void {
  const pauseFile = getPauseFile();
  if (fs.existsSync(pauseFile)) {
    console.log("Status: PAUSED");
  } else {
    console.log("Status: ACTIVE");
  }
}
