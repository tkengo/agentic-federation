import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR, ARCHIVE_DIR } from "../lib/paths.js";
import {
  getCurrentTmuxSession,
  resolveSession,
  readMeta,
} from "../lib/session.js";
import * as tmux from "../lib/tmux.js";

export function stopCommand(sessionName?: string): void {
  // Resolve session name
  const targetSession = sessionName ?? getCurrentTmuxSession();
  if (!targetSession) {
    console.error(
      "Error: No session name provided and not running inside a tmux session."
    );
    process.exit(1);
  }

  // Prevent stopping the session you're currently inside
  const currentSession = getCurrentTmuxSession();
  if (currentSession && currentSession === targetSession) {
    console.error(
      `Error: Cannot stop session '${targetSession}' from within itself.\n` +
      `  Run this command from outside the tmux session, e.g.:\n` +
      `    fed stop ${targetSession}`
    );
    process.exit(1);
  }

  const sessionDir = resolveSession(targetSession);
  if (!sessionDir) {
    console.error(
      `Error: No active session found for '${targetSession}'.`
    );
    process.exit(1);
  }

  const meta = readMeta(sessionDir);
  console.log(`Stopping session: ${targetSession}`);
  if (meta) {
    if (meta.repo) {
      console.log(`  Repo:     ${meta.repo}`);
      console.log(`  Branch:   ${meta.branch}`);
      console.log(`  Worktree: ${meta.worktree}`);
    } else {
      console.log(`  Type:     Standalone`);
    }
  }

  // 1. Stop watcher processes via PID files
  stopWatcherProcesses(sessionDir);

  // 2. Kill tmux session (this also stops all processes in panes)
  if (tmux.hasSession(targetSession)) {
    try {
      tmux.tmux(`kill-session -t '${targetSession}'`);
      console.log(`  Killed tmux session: ${targetSession}`);
    } catch {
      console.error(`  Warning: Failed to kill tmux session '${targetSession}'.`);
    }
  } else {
    console.log(`  tmux session '${targetSession}' not found (already stopped).`);
  }

  // 3. Remove active symlink
  const linkPath = path.join(ACTIVE_DIR, targetSession);
  try {
    fs.lstatSync(linkPath);
    fs.unlinkSync(linkPath);
    console.log(`  Removed active symlink: ${targetSession}`);
  } catch {
    // Symlink doesn't exist, ignore
  }

  // 4. Move session directory to archive
  const repoName = meta?.repo || "_standalone";
  const dirName = path.basename(sessionDir);
  const archiveDest = path.join(ARCHIVE_DIR, repoName, dirName);
  fs.mkdirSync(path.join(ARCHIVE_DIR, repoName), { recursive: true });

  try {
    fs.renameSync(sessionDir, archiveDest);
    console.log(`  Archived: ${archiveDest}`);
  } catch {
    // Cross-device rename fallback
    try {
      fs.cpSync(sessionDir, archiveDest, { recursive: true });
      fs.rmSync(sessionDir, { recursive: true, force: true });
      console.log(`  Archived: ${archiveDest}`);
    } catch (err) {
      console.error(`  Warning: Failed to archive session: ${err}`);
    }
  }

  console.log("Session stopped.");
}

// Kill watcher processes tracked by PID files in the session directory
function stopWatcherProcesses(sessionDir: string): void {
  const pidFiles = [
    "notification-watcher.pid",
  ];

  for (const pidFile of pidFiles) {
    const pidPath = path.join(sessionDir, pidFile);
    if (!fs.existsSync(pidPath)) continue;

    try {
      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
      if (!isNaN(pid)) {
        process.kill(pid, "SIGTERM");
        console.log(`  Stopped ${pidFile.replace(".pid", "")} (PID: ${pid})`);
      }
    } catch {
      // Process already dead or permission issue
    }

    // Remove PID file
    try {
      fs.unlinkSync(pidPath);
    } catch {
      // Best effort
    }
  }
}
