import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { requireSessionDir } from "../lib/session.js";

export interface ClaudeSessionEntry {
  tool: "claude";
  session_id: string;
  args: string[];
  started_at: string;
}

export type SessionsJson = Record<string, ClaudeSessionEntry>;

// Read sessions.json from a session directory
export function loadSessionsJson(sessionDir: string): SessionsJson | null {
  const sessionsPath = path.join(sessionDir, "sessions.json");
  if (!fs.existsSync(sessionsPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(sessionsPath, "utf-8")) as SessionsJson;
  } catch {
    return null;
  }
}

// Quote a string for shell safety
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function claudeCommand(args: string[]): void {
  const sessionDir = requireSessionDir();
  const uuid = crypto.randomUUID();

  // Get tmux pane identifier: "window_name.pane_index"
  let paneKey = "unknown";
  try {
    paneKey = execSync(
      "tmux display-message -p '#{window_name}.#{pane_index}'",
      { encoding: "utf-8" }
    ).trim();
  } catch {
    // Not in tmux or tmux query failed
  }

  // Load or create sessions.json
  const sessionsPath = path.join(sessionDir, "sessions.json");
  let sessions: SessionsJson = {};
  if (fs.existsSync(sessionsPath)) {
    try {
      sessions = JSON.parse(fs.readFileSync(sessionsPath, "utf-8")) as SessionsJson;
    } catch {
      sessions = {};
    }
  }

  // Save session entry
  sessions[paneKey] = {
    tool: "claude",
    session_id: uuid,
    args,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(sessionsPath, JSON.stringify(sessions, null, 2) + "\n");

  console.log(`[fed] Claude session: ${uuid} (pane: ${paneKey})`);

  // Execute claude with --session-id, replacing this process effectively
  const claudeArgs = ["--session-id", uuid, ...args];
  const cmd = `claude ${claudeArgs.map(shellQuote).join(" ")}`;
  try {
    execSync(cmd, { stdio: "inherit", env: process.env });
  } catch {
    // claude exited with non-zero (user ctrl-c, etc.)
  }
}
