import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { SESSIONS_DIR, ACTIVE_DIR } from "./paths.js";
import type { MetaJson } from "./types.js";

// Generate session directory name: YYYYMMDDHHMMSS_<6charID>_<suffix>
export function generateSessionDirName(suffix: string): string {
  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  const id = crypto.randomBytes(3).toString("hex");
  return `${ts}_${id}_${suffix}`;
}

// Create session directory and write meta.json
// Path: ~/.fed/sessions/<repoName>/YYYYMMDDHHMMSS_<id>_<suffix>/
// For standalone sessions, tmux_session is used as suffix when branch is empty.
export function createSessionDir(repoName: string, meta: MetaJson): string {
  const dirName = generateSessionDirName(meta.branch || meta.tmux_session);
  const sessionPath = path.join(SESSIONS_DIR, repoName, dirName);
  fs.mkdirSync(sessionPath, { recursive: true });
  meta.session_dir = sessionPath;
  fs.writeFileSync(
    path.join(sessionPath, "meta.json"),
    JSON.stringify(meta, null, 2) + "\n"
  );
  return sessionPath;
}

// Create or update active symlink: ~/.fed/active/<tmux-session> -> session dir
export function linkActiveSession(
  tmuxSession: string,
  sessionPath: string
): void {
  const linkPath = path.join(ACTIVE_DIR, tmuxSession);
  // Compute relative path from active/ to sessions/<dir>
  const relTarget = path.relative(ACTIVE_DIR, sessionPath);

  // Remove existing symlink if present
  try {
    fs.lstatSync(linkPath);
    fs.unlinkSync(linkPath);
  } catch {
    // Does not exist, ignore
  }

  fs.symlinkSync(relTarget, linkPath);
}

// Resolve tmux session name to real session directory path
export function resolveSession(tmuxSession: string): string | null {
  const linkPath = path.join(ACTIVE_DIR, tmuxSession);
  try {
    const realPath = fs.realpathSync(linkPath);
    if (fs.existsSync(realPath)) {
      return realPath;
    }
  } catch {
    // Broken or missing symlink
  }
  return null;
}

// CLI --session override (set via preAction hook in index.ts)
let _sessionOverride: string | null = null;

export function setSessionOverride(name: string): void {
  _sessionOverride = name;
}

// Get current tmux session name from the environment
export function getCurrentTmuxSession(): string | null {
  // Highest priority: explicit --session CLI flag
  if (_sessionOverride) {
    return _sessionOverride;
  }

  // FED_SESSION is set by `fed start` in tmux session environment.
  // This avoids needing tmux socket access (required for sandboxed agents like Codex).
  if (process.env.FED_SESSION) {
    return process.env.FED_SESSION;
  }

  // Fallback: query tmux directly via socket
  if (!process.env.TMUX) {
    return null;
  }
  try {
    return execSync("tmux display-message -p '#S'", {
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

// Resolve current session directory or exit with error
export function requireSessionDir(): string {
  const tmuxSession = getCurrentTmuxSession();
  if (!tmuxSession) {
    console.error("Error: Not running inside a tmux session.");
    process.exit(1);
  }
  const sessionDir = resolveSession(tmuxSession);
  if (!sessionDir) {
    console.error(
      `Error: No active session found for tmux session '${tmuxSession}'.`
    );
    process.exit(1);
  }
  return sessionDir;
}

// Read meta.json from a session directory
// Normalizes old format (mode) to new format (workflow)
export function readMeta(sessionPath: string): MetaJson | null {
  const metaPath = path.join(sessionPath, "meta.json");
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as MetaJson;
    return meta;
  } catch {
    return null;
  }
}
