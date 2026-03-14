import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { ACTIVE_DIR } from "../lib/paths.js";
import { resolveSession, readMeta } from "../lib/session.js";
import { loadRepoConfig } from "../lib/repo.js";
import * as tmux from "../lib/tmux.js";
import type { StateJson } from "../lib/types.js";
import type { WorkflowDefinition } from "../lib/workflow.js";
import { loadSessionsJson, type SessionsJson } from "./claude.js";
import {
  applyEnvironmentVars,
  startNotificationWatcher,
  syncCommands,
  syncAgents,
} from "./start.js";

// Format elapsed time as human-readable string
function formatAge(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = now - created;

  if (isNaN(created)) return "?";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export interface RestorableSession {
  name: string;
  sessionDir: string;
  repo: string;
  branch: string;
  workflow: string;
  status: string;
  age: string;
}

// Find sessions that have active symlinks but no running tmux session
export function findRestorableSessions(): RestorableSession[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];

  const entries = fs.readdirSync(ACTIVE_DIR);
  const results: RestorableSession[] = [];

  for (const entry of entries) {
    // Skip if tmux session still exists (not dead)
    if (tmux.hasSession(entry)) continue;

    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;

    const meta = readMeta(sessionDir);
    if (!meta) continue;

    // Require expanded workflow.yaml in session dir
    if (!fs.existsSync(path.join(sessionDir, "workflow.yaml"))) continue;

    // Read status from state.json
    let status = "unknown";
    const statePath = path.join(sessionDir, "state.json");
    if (fs.existsSync(statePath)) {
      try {
        const state = JSON.parse(
          fs.readFileSync(statePath, "utf-8")
        ) as StateJson;
        status = state.status || "unknown";
      } catch {
        // ignore parse errors
      }
    }

    results.push({
      name: entry,
      sessionDir,
      repo: meta.repo,
      branch: meta.branch,
      workflow: meta.workflow ?? "unknown",
      status,
      age: formatAge(meta.created_at),
    });
  }

  return results;
}

// --- fed restore list ---

export function restoreListCommand(): void {
  const sessions = findRestorableSessions();
  if (sessions.length === 0) {
    console.log("No restorable sessions found.");
    return;
  }

  type Row = {
    session: string;
    workflow: string;
    status: string;
    age: string;
  };

  const rows: Row[] = sessions.map((s) => ({
    session: s.repo ? `${s.repo}/${s.branch}` : s.name,
    workflow: s.workflow,
    status: s.status,
    age: s.age,
  }));

  // Calculate column widths
  const headers = {
    session: "SESSION",
    workflow: "WORKFLOW",
    status: "STATUS",
    age: "AGE",
  };
  const widths = {
    session: Math.max(headers.session.length, ...rows.map((r) => r.session.length)),
    workflow: Math.max(headers.workflow.length, ...rows.map((r) => r.workflow.length)),
    status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
    age: Math.max(headers.age.length, ...rows.map((r) => r.age.length)),
  };

  console.log("Restorable sessions:");
  console.log(
    `  ${headers.session.padEnd(widths.session)}  ` +
    `${headers.workflow.padEnd(widths.workflow)}  ` +
    `${headers.status.padEnd(widths.status)}  ` +
    `${headers.age.padStart(widths.age)}`
  );

  for (const row of rows) {
    console.log(
      `  ${row.session.padEnd(widths.session)}  ` +
      `${row.workflow.padEnd(widths.workflow)}  ` +
      `${row.status.padEnd(widths.status)}  ` +
      `${row.age.padStart(widths.age)}`
    );
  }
}

// --- fed restore session <name> ---

// Cleanup stale PID files from before the reboot
function cleanupStalePidFiles(sessionDir: string): void {
  const pidFiles = ["notification-watcher.pid"];

  for (const pidFile of pidFiles) {
    const pidPath = path.join(sessionDir, pidFile);
    if (!fs.existsSync(pidPath)) continue;

    try {
      const pid = parseInt(fs.readFileSync(pidPath, "utf-8").trim(), 10);
      if (!isNaN(pid)) {
        try {
          process.kill(pid, 0); // Check if process is alive
          process.kill(pid, "SIGTERM"); // Kill if still alive
          console.log(`  Killed stale ${pidFile.replace(".pid", "")} (PID: ${pid})`);
        } catch {
          // Process dead (expected after reboot)
        }
      }
    } catch {
      // ignore read errors
    }

    try {
      fs.unlinkSync(pidPath);
    } catch {
      // ignore
    }
  }
}

// Build the command to send to a pane during restore.
// For Claude panes with saved session IDs, replace "fed claude" with "claude --resume <uuid>".
// For all other panes, return the original command as-is.
function buildRestoreCommand(
  originalCommand: string,
  paneKey: string,
  sessionsJson: SessionsJson | null
): string {
  if (!sessionsJson) return originalCommand;

  const entry = sessionsJson[paneKey];
  if (!entry || entry.tool !== "claude") return originalCommand;

  // Match "fed claude" at the start of the command
  const match = originalCommand.match(/^fed\s+claude\s*(.*)/);
  if (!match) return originalCommand;

  const restArgs = match[1] || "";
  const resumed = `claude --resume '${entry.session_id}' ${restArgs}`.trim();
  console.log(`  Restoring Claude session: ${entry.session_id} (pane: ${paneKey})`);
  return resumed;
}

export function restoreCommand(
  sessionName: string,
  noAttach?: boolean
): void {
  // 1. Preflight checks
  if (process.env.TMUX && !noAttach) {
    console.error("Error: fed session restore must be run outside of tmux.");
    console.error("  Use --no-attach to restore from within tmux.");
    process.exit(1);
  }

  const sessionDir = resolveSession(sessionName);
  if (!sessionDir) {
    console.error(
      `Error: No active session found for '${sessionName}'.`
    );
    console.error("  Run 'fed session list --restorable' to see restorable sessions.");
    process.exit(1);
  }

  const meta = readMeta(sessionDir);
  if (!meta) {
    console.error(`Error: Cannot read meta.json from ${sessionDir}`);
    process.exit(1);
  }

  const workflowPath = path.join(sessionDir, "workflow.yaml");
  if (!fs.existsSync(workflowPath)) {
    console.error(`Error: workflow.yaml not found in ${sessionDir}`);
    process.exit(1);
  }

  if (tmux.hasSession(sessionName)) {
    console.error(
      `Error: tmux session '${sessionName}' already exists (not dead).`
    );
    process.exit(1);
  }

  // 2. Read expanded workflow from session dir
  const workflow = parseYaml(
    fs.readFileSync(workflowPath, "utf-8")
  ) as WorkflowDefinition;

  console.log(`=== fed session restore ===`);
  console.log(`Session:  ${sessionName}`);
  console.log(`Workflow: ${meta.workflow}`);
  if (meta.repo) {
    console.log(`Repo:     ${meta.repo}`);
    console.log(`Branch:   ${meta.branch}`);
    console.log(`Worktree: ${meta.worktree}`);
  } else {
    console.log(`Type:     Standalone`);
  }
  console.log(`Dir:      ${sessionDir}`);

  // 3. Cleanup stale PID files
  cleanupStalePidFiles(sessionDir);

  // 4. Sync commands and agents
  syncCommands();
  syncAgents(meta.workflow);

  // 5. Determine cwd
  const cwd = meta.worktree || sessionDir;

  // Verify cwd exists
  if (!fs.existsSync(cwd)) {
    console.error(`Error: Working directory does not exist: ${cwd}`);
    process.exit(1);
  }

  // 6. Load sessions.json for Claude session restoration
  const sessionsJson = loadSessionsJson(sessionDir);

  // 7. Recreate tmux session + windows + panes
  for (let i = 0; i < workflow.windows.length; i++) {
    const win = workflow.windows[i]!;
    if (i === 0) {
      console.log(`Creating tmux session (window: ${win.name})...`);
      tmux.newSession(sessionName, cwd, win.name);

      // Set FED_SESSION environment variable
      tmux.setEnvironment(sessionName, "FED_SESSION", sessionName);

      // Restore repo environment variables
      if (meta.repo) {
        try {
          const config = loadRepoConfig(meta.repo);
          applyEnvironmentVars(sessionName, config.env);
        } catch {
          console.error(`  Warning: Could not load repo config for '${meta.repo}'.`);
        }
      }
    } else {
      console.log(`Creating window: ${win.name}...`);
      tmux.newWindow(sessionName, win.name, cwd);
    }

    // Create pane layout (splits)
    const w = `${sessionName}:${win.name}`;
    for (const split of win.layout.splits) {
      tmux.splitWindow(
        `${w}.${split.source}`,
        split.direction,
        split.percent,
        cwd
      );
    }
    tmux.selectPane(`${w}.${win.layout.focus}`);

    // Execute pane commands with Claude session restoration
    for (const pane of win.panes) {
      if (!pane.command) continue;

      // tmux pane_index is 0-based, workflow pane.pane is 1-based
      const paneKey = `${win.name}.${pane.pane - 1}`;
      const restoredCommand = buildRestoreCommand(
        pane.command,
        paneKey,
        sessionsJson
      );
      tmux.sendKeys(`${w}.${pane.pane}`, restoredCommand);
    }
  }

  // 8. Focus window
  const focusWindow = workflow.focus || workflow.windows[0]!.name;
  tmux.selectWindow(`${sessionName}:${focusWindow}`);

  // 9. Customize tmux status bar
  tmux.setOption(sessionName, "status-style", "bg=colour24,fg=white");
  const statusLabel = meta.repo
    ? (sessionName !== meta.branch
      ? `${meta.workflow}:${meta.repo}/${meta.branch} (${sessionName})`
      : `${meta.workflow}:${meta.repo}/${meta.branch}`)
    : `${meta.workflow}:${sessionName}`;
  tmux.setOption(sessionName, "status-right", ` ⚡fed ▸ ${statusLabel} `);

  // 10. Restart notification watcher
  startNotificationWatcher(sessionDir, sessionName);

  // 11. Done
  console.log("");
  console.log("=== Session Restored ===");
  console.log("");
  console.log("Windows:");
  for (let i = 0; i < workflow.windows.length; i++) {
    const win = workflow.windows[i]!;
    console.log(`  ${i + 1}. ${win.name}`);
  }
  console.log("");

  if (noAttach) {
    console.log("Session restored (--no-attach). Skipping tmux attach.");
  } else {
    console.log("Attaching to tmux session...");
    execSync(`tmux attach -t '${sessionName}'`, { stdio: "inherit" });
  }
}
