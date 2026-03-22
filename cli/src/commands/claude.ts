import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { requireSessionDir, readMeta } from "../lib/session.js";

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


// Resolve agent role name to full composed agent name.
// Builds the expected filename from workflow name, tmux session, and role,
// then verifies it exists.
function resolveAgentArg(sessionDir: string, agent: string): string {
  const meta = readMeta(sessionDir);
  if (!meta) {
    console.error("Error: Cannot read meta.json from session directory.");
    process.exit(1);
  }

  const expectedName = `__fed-${meta.workflow}-${meta.tmux_session}-${agent}`;
  const expectedFile = path.join(sessionDir, "agents", `${expectedName}.md`);

  if (fs.existsSync(expectedFile)) return expectedName;

  // Not found - show available agents for debugging
  const agentsDir = path.join(sessionDir, "agents");
  console.error(`Error: Agent '${agent}' not found.`);
  console.error(`  Expected: ${expectedName}.md`);
  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
    if (files.length > 0) {
      console.error("Available agents:");
      files.forEach((f) => console.error(`  - ${f.replace(/\.md$/, "")}`));
    }
  }
  process.exit(1);
}

export function claudeCommand(args: string[], newSession?: boolean, agent?: string): void {
  const sessionDir = requireSessionDir();

  // Resolve agent name if specified
  let agentArgs: string[] = [];
  if (agent) {
    const resolvedName = resolveAgentArg(sessionDir, agent);
    agentArgs = ["--agent", resolvedName];
    console.log(`[fed] Resolved agent: ${agent} → ${resolvedName}`);
  }

  // Get tmux pane identifier: "window_name.pane_index"
  let paneKey = "unknown";
  try {
    paneKey = execSync(
      'tmux display-message -t "$TMUX_PANE" -p \'#{window_name}.#{pane_index}\'',
      { encoding: "utf-8" }
    ).trim();
  } catch {
    // Not in tmux or tmux query failed
  }

  const claudeSessionsDir = path.join(sessionDir, "claude-sessions");
  const sessionFile = path.join(claudeSessionsDir, `${paneKey}.json`);

  // Resume existing session if available (unless --new or --agent is specified)
  if (!newSession && !agent && fs.existsSync(sessionFile)) {
    try {
      const existing = JSON.parse(
        fs.readFileSync(sessionFile, "utf-8")
      ) as ClaudeSessionEntry;
      console.log(`[fed] Resuming Claude session: ${existing.session_id} (pane: ${paneKey})`);
      const cmd = `claude --resume ${shellQuote(existing.session_id)}`;
      try {
        execSync(cmd, { stdio: "inherit", env: process.env });
      } catch {
        // claude exited with non-zero (user ctrl-c, etc.)
      }
      return;
    } catch {
      // Corrupted session file, fall through to create new session
    }
  }

  // Create new session
  const uuid = crypto.randomUUID();
  fs.mkdirSync(claudeSessionsDir, { recursive: true });
  const entry: ClaudeSessionEntry = {
    tool: "claude",
    session_id: uuid,
    args,
    started_at: new Date().toISOString(),
  };
  fs.writeFileSync(sessionFile, JSON.stringify(entry, null, 2) + "\n");

  console.log(`[fed] Claude session: ${uuid} (pane: ${paneKey})`);

  // Execute claude with --session-id and optional --agent
  const claudeArgs = ["--session-id", uuid, ...agentArgs, ...args];
  const cmd = `claude ${claudeArgs.map(shellQuote).join(" ")}`;
  try {
    execSync(cmd, { stdio: "inherit", env: process.env });
  } catch {
    // claude exited with non-zero (user ctrl-c, etc.)
  }
}
