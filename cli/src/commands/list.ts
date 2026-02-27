import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR } from "../lib/paths.js";
import { resolveSession, readMeta } from "../lib/session.js";
import type { StateJson } from "../lib/types.js";
import { findCleanTargets } from "./clean.js";

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

function printCleanableSummary(): void {
  const cleanTargets = findCleanTargets();
  if (cleanTargets.length > 0) {
    console.log();
    console.log(`  ${cleanTargets.length} worktree(s) to clean (fed clean --dry-run to preview)`);
  }
}

export function listCommand(): void {
  if (!fs.existsSync(ACTIVE_DIR)) {
    console.log("No active sessions.");
    printCleanableSummary();
    return;
  }

  const entries = fs.readdirSync(ACTIVE_DIR);
  if (entries.length === 0) {
    console.log("No active sessions.");
    printCleanableSummary();
    return;
  }

  type Row = {
    repo: string;
    branch: string;
    workflow: string;
    status: string;
    age: string;
  };

  const rows: Row[] = [];

  for (const entry of entries) {
    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;

    const meta = readMeta(sessionDir);
    if (!meta) continue;

    let status = "active";
    const statePath = path.join(sessionDir, "state.json");
    if (fs.existsSync(statePath)) {
      try {
        const state = JSON.parse(
          fs.readFileSync(statePath, "utf-8")
        ) as StateJson;
        status = state.status || "active";
      } catch {
        // Ignore parse errors
      }
    }

    rows.push({
      repo: meta.repo,
      branch: meta.branch,
      workflow: meta.workflow ?? "solo",
      status,
      age: formatAge(meta.created_at),
    });
  }

  if (rows.length === 0) {
    console.log("No active sessions.");
    printCleanableSummary();
    return;
  }

  // Calculate column widths
  const headers = { repo: "REPO", branch: "BRANCH", workflow: "WORKFLOW", status: "STATUS", age: "AGE" };
  const widths = {
    repo: Math.max(headers.repo.length, ...rows.map((r) => r.repo.length)),
    branch: Math.max(headers.branch.length, ...rows.map((r) => r.branch.length)),
    workflow: Math.max(headers.workflow.length, ...rows.map((r) => r.workflow.length)),
    status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
    age: Math.max(headers.age.length, ...rows.map((r) => r.age.length)),
  };

  // Print header
  console.log(
    `  ${headers.repo.padEnd(widths.repo)}  ` +
    `${headers.branch.padEnd(widths.branch)}  ` +
    `${headers.workflow.padEnd(widths.workflow)}  ` +
    `${headers.status.padEnd(widths.status)}  ` +
    `${headers.age.padStart(widths.age)}`
  );

  // Print rows
  for (const row of rows) {
    console.log(
      `  ${row.repo.padEnd(widths.repo)}  ` +
      `${row.branch.padEnd(widths.branch)}  ` +
      `${row.workflow.padEnd(widths.workflow)}  ` +
      `${row.status.padEnd(widths.status)}  ` +
      `${row.age.padStart(widths.age)}`
    );
  }

  printCleanableSummary();
}
