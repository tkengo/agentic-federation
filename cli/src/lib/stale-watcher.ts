#!/usr/bin/env node
//
// stale-watcher.ts - Periodic staleness checker for agent team state
//
// Checks state.json modification time and sends macOS notifications
// when the state hasn't been updated for a configurable threshold.
//
// Usage (standalone): node stale-watcher.js <session-dir> <tmux-session>
//

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { loadSessionWorkflow, getTerminalStates } from "./workflow.js";

const sessionDir = process.argv[2];
const tmuxSession = process.argv[3];
const STALE_THRESHOLD_SEC = 600; // 10 minutes
const CHECK_INTERVAL_MS = 60_000; // 1 minute

if (!sessionDir || !tmuxSession) {
  console.error("Usage: stale-watcher.js <session-dir> <tmux-session>");
  process.exit(1);
}

const stateFile = path.join(sessionDir, "state.json");
const pauseFile = path.join(sessionDir, ".pause_stale_watcher");

// Resolve terminal statuses from workflow if available, else use hardcoded defaults
function resolveTerminalStatuses(): Set<string> {
  try {
    const wf = loadSessionWorkflow(sessionDir);
    if (wf) {
      return new Set(getTerminalStates(wf));
    }
  } catch {
    // Fallback to defaults on any error
  }
  return new Set(["completed", "approved", "waiting_human"]);
}

const TERMINAL_STATUSES = resolveTerminalStatuses();

function log(msg: string): void {
  console.log(`[stale-watcher] ${msg}`);
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

function sendMacOSNotification(title: string, message: string): void {
  try {
    const escapedMessage = message.replace(/"/g, '\\"');
    const escapedTitle = title.replace(/"/g, '\\"');
    execSync(
      `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "Glass"'`,
      { stdio: "ignore" }
    );
  } catch {
    // osascript may not be available
  }
}

function checkStaleness(): void {
  // Skip if paused
  if (fs.existsSync(pauseFile)) return;

  // Skip if state.json doesn't exist
  if (!fs.existsSync(stateFile)) return;

  try {
    const stat = fs.statSync(stateFile);
    const elapsedSec = Math.floor((Date.now() - stat.mtimeMs) / 1000);

    if (elapsedSec < STALE_THRESHOLD_SEC) return;

    // Read current status
    const state = JSON.parse(fs.readFileSync(stateFile, "utf-8"));
    const status: string = state.status ?? "UNKNOWN";

    // Skip terminal statuses
    if (TERMINAL_STATUSES.has(status)) return;

    log(`Stale detected: status=${status}, elapsed=${elapsedSec}s`);
    sendMacOSNotification(
      "Agent Team Stale",
      `[${tmuxSession}] Status: ${status} (${elapsedSec}s stale)`
    );
  } catch {
    // Ignore errors reading state
  }
}

log(`Started for session '${tmuxSession}'`);
log(`Watching: ${stateFile}`);
log(`Threshold: ${STALE_THRESHOLD_SEC}s`);

// Save PID to session directory for cleanup
const pidFile = path.join(sessionDir, "stale-watcher.pid");
fs.writeFileSync(pidFile, String(process.pid) + "\n");

// Periodic check
const interval = setInterval(() => {
  if (!tmuxSessionAlive()) {
    log(`Session '${tmuxSession}' ended. Exiting.`);
    cleanup();
    return;
  }
  checkStaleness();
}, CHECK_INTERVAL_MS);

function cleanup(): void {
  clearInterval(interval);
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
