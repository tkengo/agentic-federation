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

// Load Claude session entries from per-pane files in claude-sessions/
export function loadSessionsJson(sessionDir: string): SessionsJson | null {
  const claudeSessionsDir = path.join(sessionDir, "claude-sessions");
  if (!fs.existsSync(claudeSessionsDir)) return null;

  const sessions: SessionsJson = {};
  for (const file of fs.readdirSync(claudeSessionsDir)) {
    if (!file.endsWith(".json")) continue;
    const paneKey = file.replace(/\.json$/, "");
    try {
      const entry = JSON.parse(
        fs.readFileSync(path.join(claudeSessionsDir, file), "utf-8")
      ) as ClaudeSessionEntry;
      sessions[paneKey] = entry;
    } catch {
      // Skip corrupted files
    }
  }
  return Object.keys(sessions).length > 0 ? sessions : null;
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

  // Write per-pane session file (no shared file = no race condition)
  const claudeSessionsDir = path.join(sessionDir, "claude-sessions");
  fs.mkdirSync(claudeSessionsDir, { recursive: true });
  const entry: ClaudeSessionEntry = {
    tool: "claude",
    session_id: uuid,
    args,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(
    path.join(claudeSessionsDir, `${paneKey}.json`),
    JSON.stringify(entry, null, 2) + "\n"
  );

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
