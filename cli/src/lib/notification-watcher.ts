#!/usr/bin/env node
//
// notification-watcher.ts - File-based notification system for agent team
//
// Watches a session's notifications/ directory using chokidar and sends
// messages to tmux panes. Replaces the fswatch-based notification-watcher.sh.
//
// Usage (standalone): node notification-watcher.js <session-dir> <tmux-session>
//
// Notification file format:
//   Line 1: target pane (e.g., "session:window.pane")
//   Line 2+: message to send
//

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { watch } from "chokidar";

const sessionDir = process.argv[2];
const tmuxSession = process.argv[3];

if (!sessionDir || !tmuxSession) {
  console.error(
    "Usage: notification-watcher.js <session-dir> <tmux-session>"
  );
  process.exit(1);
}

const notifyDir = path.join(sessionDir, "notifications");
fs.mkdirSync(notifyDir, { recursive: true });

function log(msg: string): void {
  console.log(`[notification-watcher] ${msg}`);
}

function tmuxSessionAlive(): boolean {
  try {
    execSync(`tmux has-session -t '${tmuxSession}' 2>/dev/null`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function processNotification(filePath: string): void {
  if (!filePath.endsWith(".notify")) return;

  const tmpFile = filePath + ".processing";

  // Atomically claim the file by renaming
  try {
    fs.renameSync(filePath, tmpFile);
  } catch {
    // Another process claimed it, or it no longer exists
    return;
  }

  try {
    const content = fs.readFileSync(tmpFile, "utf-8");
    const lines = content.split("\n");
    const target = lines[0]?.trim();
    const message = lines.slice(1).join("\n").trim();

    if (target && message) {
      log(`Sending to ${target}: ${message.slice(0, 50)}...`);
      try {
        const q = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
        execSync(`tmux send-keys -t ${q(target)} ${q(message)}`, {
          stdio: "ignore",
        });
        execSync("sleep 1");
        execSync(`tmux send-keys -t ${q(target)} Enter`, {
          stdio: "ignore",
        });
        log("Sent successfully");
      } catch {
        log(`Failed to send to ${target}`);
      }
    }
  } catch (err) {
    log(`Error processing ${filePath}: ${err}`);
  }

  // Rename to .processed for debugging
  const processedPath = filePath.replace(/\.notify$/, ".processed");
  try {
    fs.renameSync(tmpFile, processedPath);
  } catch {
    // Best effort
  }
}

// Process any existing notification files first
try {
  const existing = fs.readdirSync(notifyDir).filter((f) => f.endsWith(".notify"));
  for (const f of existing) {
    processNotification(path.join(notifyDir, f));
  }
} catch {
  // Directory might not exist yet
}

// Watch for new .notify files
const watcher = watch(notifyDir, {
  ignoreInitial: true,
  awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
});

watcher.on("add", (filePath: string) => {
  processNotification(filePath);
});

log(`Started for session '${tmuxSession}'`);
log(`Watching: ${notifyDir}`);

// Save PID to session directory for cleanup
const pidFile = path.join(sessionDir, "notification-watcher.pid");
fs.writeFileSync(pidFile, String(process.pid) + "\n");

// Periodically check if tmux session is alive
const sessionCheck = setInterval(() => {
  if (!tmuxSessionAlive()) {
    log(`Session '${tmuxSession}' ended. Exiting.`);
    cleanup();
  }
}, 30_000);

function cleanup(): void {
  clearInterval(sessionCheck);
  watcher.close();
  // Remove PID file
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // Best effort
  }
  log("Stopped");
  process.exit(0);
}

process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
