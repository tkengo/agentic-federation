import fs from "node:fs";
import path from "node:path";
import {
  getCurrentTmuxSession,
  resolveSession,
  readMeta,
} from "../lib/session.js";
import type { StateJson } from "../lib/types.js";

// Format a timestamp for display
function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

// Format elapsed time as human-readable string
function formatAge(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = now - created;

  if (isNaN(created)) return "?";

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return `${hours}h ${remainingMinutes}m`;

  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

export function infoCommand(sessionName?: string): void {
  // Resolve session name
  const targetSession = sessionName ?? getCurrentTmuxSession();
  if (!targetSession) {
    console.error(
      "Error: No session name provided and not running inside a tmux session."
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
  if (!meta) {
    console.error("Error: Could not read meta.json.");
    process.exit(1);
  }

  // Session metadata
  console.log(`=== Session: ${targetSession} ===`);
  console.log("");
  if (meta.repo) {
    console.log(`  Repo:        ${meta.repo}`);
    console.log(`  Branch:      ${meta.branch}`);
    console.log(`  Worktree:    ${meta.worktree}`);
  } else {
    console.log(`  Type:        Standalone`);
  }
  console.log(`  Workflow:    ${meta.workflow ?? "solo"}`);
  console.log(`  Created:     ${formatTimestamp(meta.created_at)} (${formatAge(meta.created_at)} ago)`);
  console.log(`  Session dir: ${sessionDir}`);

  // State
  const statePath = path.join(sessionDir, "state.json");
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(
        fs.readFileSync(statePath, "utf-8")
      ) as StateJson;

      if (state.status) {
        console.log("");
        console.log("  Status:      " + state.status);
      }
      const retryParts = Object.entries(state.retry_count)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      if (retryParts) {
        console.log(`  Retries:     ${retryParts}`);
      }
      if (state.pending_tasks.length > 0) {
        console.log(`  Pending:     ${state.pending_tasks.join(", ")}`);
      }
      if (state.escalation.required) {
        console.log(`  Escalation:  ${state.escalation.reason ?? "yes"}`);
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Artifacts
  console.log("");
  console.log("  Artifacts:");
  const artifactsDir = path.join(sessionDir, "artifacts");
  let hasArtifacts = false;
  if (fs.existsSync(artifactsDir)) {
    const files = fs.readdirSync(artifactsDir).filter((f) =>
      fs.statSync(path.join(artifactsDir, f)).isFile()
    );
    for (const file of files) {
      const filePath = path.join(artifactsDir, file);
      const stat = fs.statSync(filePath);
      const size = stat.size;
      const modified = stat.mtime.toLocaleString();
      console.log(`    ${file.padEnd(24)} ${formatFileSize(size).padStart(8)}  ${modified}`);
      hasArtifacts = true;
    }
  }
  if (!hasArtifacts) {
    console.log("    (none)");
  }

  // History (last 10 entries)
  const historyPath = path.join(sessionDir, "history.jsonl");
  if (fs.existsSync(historyPath)) {
    const lines = fs.readFileSync(historyPath, "utf-8").trim().split("\n").filter(Boolean);
    if (lines.length > 0) {
      console.log("");
      console.log("  Recent history:");
      const recent = lines.slice(-10);
      for (const line of recent) {
        try {
          const entry = JSON.parse(line) as {
            ts: string;
            event: string;
            status?: string;
            field?: string;
            value?: unknown;
            detail?: string;
          };
          const ts = new Date(entry.ts).toLocaleTimeString();
          let detail = entry.event;
          if (entry.field) {
            detail += ` ${entry.field}=${JSON.stringify(entry.value)}`;
          }
          if (entry.status) {
            detail += ` [${entry.status}]`;
          }
          if (entry.detail) {
            detail += ` ${entry.detail}`;
          }
          console.log(`    ${ts}  ${detail}`);
        } catch {
          // Skip malformed lines
        }
      }
      if (lines.length > 10) {
        console.log(`    ... and ${lines.length - 10} more entries`);
      }
    }
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
