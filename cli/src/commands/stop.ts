import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ACTIVE_DIR, ARCHIVE_DIR, CLAUDE_AGENTS_DIR } from "../lib/paths.js";
import {
  getCurrentTmuxSession,
  resolveSession,
  readMeta,
} from "../lib/session.js";
import * as tmux from "../lib/tmux.js";
import { collectConversations, generateConversationSummary } from "../lib/conv-store.js";

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
      `    fed session stop ${targetSession}`
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

  // 0.5. Remove agent symlinks from ~/.claude/agents/ (before archive moves files)
  unlinkAgents(sessionDir);

  // 1. Collect conversations from AI tools (best-effort)
  console.log("  Collecting conversations...");
  try {
    collectConversations(sessionDir);
    generateConversationSummary(sessionDir);
  } catch (err) {
    console.error(`  Warning: Conversation collection failed: ${err}`);
  }

  // 2. Kill artifact viewer tmux sessions (pattern: <session>__art__*)
  killArtifactSessions(targetSession);

  // 3. Kill tmux session (this also stops all processes in panes)
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

  // 4. Remove active symlink
  const linkPath = path.join(ACTIVE_DIR, targetSession);
  try {
    fs.lstatSync(linkPath);
    fs.unlinkSync(linkPath);
    console.log(`  Removed active symlink: ${targetSession}`);
  } catch {
    // Symlink doesn't exist, ignore
  }

  // 5. Move session directory to archive
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

// Kill all artifact viewer tmux sessions associated with a parent session.
// Artifact sessions follow the naming convention: <parentSession>__art__<name>
function killArtifactSessions(parentSession: string): void {
  const prefix = `${parentSession}__art__`;
  try {
    const output = execSync("tmux list-sessions -F '#S'", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const sessions = output.trim().split("\n").filter(Boolean);
    for (const s of sessions) {
      if (s.startsWith(prefix)) {
        try {
          tmux.tmux(`kill-session -t '${s}'`);
          console.log(`  Killed artifact session: ${s}`);
        } catch {
          // Best effort
        }
      }
    }
  } catch {
    // tmux not running or no sessions
  }
}

// Remove agent symlinks from ~/.claude/agents/ that point to this session
function unlinkAgents(sessionDir: string): void {
  const agentsDir = path.join(sessionDir, "agents");
  if (!fs.existsSync(agentsDir)) return;

  const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith(".md"));
  let removed = 0;

  for (const file of files) {
    const linkPath = path.join(CLAUDE_AGENTS_DIR, file);
    try {
      const stat = fs.lstatSync(linkPath);
      if (stat.isSymbolicLink()) {
        fs.unlinkSync(linkPath);
        removed++;
      }
    } catch {
      // Doesn't exist or not a symlink
    }
  }

  if (removed > 0) {
    console.log(`  Removed ${removed} agent symlink(s) from ~/.claude/agents/`);
  }
}
