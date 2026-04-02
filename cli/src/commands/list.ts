import fs from "node:fs";
import path from "node:path";
import { ACTIVE_DIR, ARCHIVE_DIR } from "../lib/paths.js";
import { resolveSession, readMeta } from "../lib/session.js";
import { findCleanTargets } from "./clean.js";

type Row = {
  repoBranch: string;
  session: string;
  workflow: string;
  status: string;
  age: string;
  createdAt: string;
  source: "active" | "archive";
};

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

// Read status from state-v2.json in a session directory
function readStatus(sessionDir: string): string {
  const statePath = path.join(sessionDir, "state-v2.json");
  if (!fs.existsSync(statePath)) return "unknown";
  try {
    const data = JSON.parse(fs.readFileSync(statePath, "utf-8")) as { status?: string };
    return data.status || "unknown";
  } catch {
    return "unknown";
  }
}

function printCleanableSummary(): void {
  const { targets, protectedCount } = findCleanTargets();
  if (targets.length > 0 || protectedCount > 0) {
    console.log();
    const parts: string[] = [];
    if (targets.length > 0) parts.push(`${targets.length} cleanable`);
    if (protectedCount > 0) parts.push(`${protectedCount} protected`);
    console.log(`  ${parts.join(", ")} worktree(s) (fed clean --dry-run to preview)`);
  }
}

// Collect active sessions from ~/.fed/active/
function collectActiveSessions(): Row[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];
  const rows: Row[] = [];
  for (const entry of fs.readdirSync(ACTIVE_DIR)) {
    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;
    const meta = readMeta(sessionDir);
    if (!meta) continue;
    rows.push({
      repoBranch: meta.repo
        ? `${meta.repo}/${meta.branch}`
        : meta.tmux_session,
      session: entry,
      workflow: meta.workflow ?? "solo",
      status: readStatus(sessionDir),
      age: formatAge(meta.created_at),
      createdAt: meta.created_at,
      source: "active",
    });
  }
  return rows;
}

// Collect archived sessions from ~/.fed/archive/<repo>/<sessionDir>/
function collectArchiveSessions(): Row[] {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  const rows: Row[] = [];
  for (const repo of fs.readdirSync(ARCHIVE_DIR)) {
    const repoDir = path.join(ARCHIVE_DIR, repo);
    if (!fs.statSync(repoDir).isDirectory()) continue;
    for (const sess of fs.readdirSync(repoDir)) {
      const sessDir = path.join(repoDir, sess);
      if (!fs.statSync(sessDir).isDirectory()) continue;
      const meta = readMeta(sessDir);
      if (!meta) continue;
      rows.push({
        repoBranch: meta.repo
          ? `${meta.repo}/${meta.branch}`
          : meta.tmux_session,
        session: meta.tmux_session,
        workflow: meta.workflow ?? "solo",
        status: readStatus(sessDir),
        age: formatAge(meta.created_at),
        createdAt: meta.created_at,
        source: "archive",
      });
    }
  }
  return rows;
}

// Print a formatted table of session rows
function printTable(rows: Row[], showSource: boolean): void {
  const headers = {
    repoBranch: "REPO/BRANCH",
    session: "SESSION",
    workflow: "WORKFLOW",
    status: "STATUS",
    source: "SOURCE",
    age: "AGE",
  };
  const widths = {
    repoBranch: Math.max(headers.repoBranch.length, ...rows.map((r) => r.repoBranch.length)),
    session: Math.max(headers.session.length, ...rows.map((r) => r.session.length)),
    workflow: Math.max(headers.workflow.length, ...rows.map((r) => r.workflow.length)),
    status: Math.max(headers.status.length, ...rows.map((r) => r.status.length)),
    source: Math.max(headers.source.length, ...rows.map((r) => r.source.length)),
    age: Math.max(headers.age.length, ...rows.map((r) => r.age.length)),
  };

  let header =
    `  ${headers.repoBranch.padEnd(widths.repoBranch)}  ` +
    `${headers.session.padEnd(widths.session)}  ` +
    `${headers.workflow.padEnd(widths.workflow)}  ` +
    `${headers.status.padEnd(widths.status)}`;
  if (showSource) header += `  ${headers.source.padEnd(widths.source)}`;
  header += `  ${headers.age.padStart(widths.age)}`;
  console.log(header);

  for (const row of rows) {
    let line =
      `  ${row.repoBranch.padEnd(widths.repoBranch)}  ` +
      `${row.session.padEnd(widths.session)}  ` +
      `${row.workflow.padEnd(widths.workflow)}  ` +
      `${row.status.padEnd(widths.status)}`;
    if (showSource) line += `  ${row.source.padEnd(widths.source)}`;
    line += `  ${row.age.padStart(widths.age)}`;
    console.log(line);
  }
}

export function listCommand(options?: {
  active?: boolean;
  archive?: boolean;
  limit?: number;
}): void {
  const showActive = options?.active ?? true;
  const showArchive = options?.archive ?? false;
  const limit = options?.limit ?? 20;

  const allRows: Row[] = [];
  if (showActive) allRows.push(...collectActiveSessions());
  if (showArchive) allRows.push(...collectArchiveSessions());

  // Sort by createdAt descending (newest first)
  allRows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const rows = allRows.slice(0, limit);

  if (rows.length === 0) {
    console.log("No sessions found.");
    printCleanableSummary();
    return;
  }

  // Show SOURCE column only when both active and archive are included
  const showSource = showActive && showArchive;
  printTable(rows, showSource);

  if (allRows.length > limit) {
    console.log(`\n  Showing ${limit} of ${allRows.length} sessions (use --limit to show more)`);
  }

  printCleanableSummary();
}
