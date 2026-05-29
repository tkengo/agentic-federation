import { useState, useCallback, useEffect } from "react";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ACTIVE_DIR, PROTECTED_WORKTREES_FILE } from "../utils/types.js";
import type { MetaJson, SessionData, AgentStateData, AgentStateValue } from "../utils/types.js";
import { listTmuxSessions } from "../utils/tmux.js";

function readMeta(sessionDir: string): MetaJson | null {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "meta.json"), "utf-8")
    ) as MetaJson;
    return meta;
  } catch {
    return null;
  }
}

interface V2StateCompat {
  status: string;
  current_step: string | null;
}

function readV2State(sessionDir: string): V2StateCompat | null {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "state-v2.json"), "utf-8")
    ) as V2StateCompat;
    return data;
  } catch {
    return null;
  }
}

function resolveSession(name: string): string | null {
  const linkPath = path.join(ACTIVE_DIR, name);
  try {
    const realPath = fs.realpathSync(linkPath);
    if (fs.existsSync(realPath)) return realPath;
  } catch {
    // Broken symlink
  }
  return null;
}

function readAgentState(sessionDir: string): AgentStateData {
  // Prefer the new file, fall back to legacy waiting_human.json so in-flight
  // sessions created before this change keep showing meaningful state.
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "agent_state.json"), "utf-8")
    ) as { state: AgentStateValue; reason: string | null };
    return { state: data.state, reason: data.reason };
  } catch {
    // fall through to legacy
  }
  try {
    const legacy = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "waiting_human.json"), "utf-8")
    ) as { waiting: boolean; reason: string | null };
    return {
      state: legacy.waiting ? "waiting_human" : "idle",
      reason: legacy.reason,
    };
  } catch {
    return { state: "idle", reason: null };
  }
}

function readDescription(sessionDir: string): string | undefined {
  try {
    const content = fs.readFileSync(path.join(sessionDir, "description.txt"), "utf-8").trim();
    return content || undefined;
  } catch {
    return undefined;
  }
}

function loadSessions(): SessionData[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];

  const entries = fs.readdirSync(ACTIVE_DIR);
  const sessions: SessionData[] = [];
  const tmuxSessions = listTmuxSessions();

  for (const entry of entries) {
    const sessionDir = resolveSession(entry);
    if (!sessionDir) continue;

    const meta = readMeta(sessionDir);
    if (!meta) continue;

    const v2State = readV2State(sessionDir);
    const statusValue = v2State?.status ?? "";

    // Read state file mtime for staleness detection
    let stateMtimeMs: number | undefined;
    if (statusValue) {
      const stateFile = path.join(sessionDir, "state-v2.json");
      try {
        stateMtimeMs = fs.statSync(stateFile).mtimeMs;
      } catch {
        // state file may not exist
      }
    }

    sessions.push({
      name: entry,
      sessionDir,
      meta,
      status: statusValue || "active",
      workflow: meta.workflow,
      agentState: readAgentState(sessionDir),
      description: readDescription(sessionDir),
      currentStep: v2State?.current_step ?? null,
      stateMtimeMs,
      tmuxAlive: tmuxSessions.has(entry),
    });
  }

  // Sort by repo name (primary) then branch name (secondary), ascending, case-insensitive
  sessions.sort((a, b) => {
    const repoCompare = a.meta.repo.localeCompare(b.meta.repo, undefined, { sensitivity: "base" });
    if (repoCompare !== 0) return repoCompare;
    return a.meta.branch.localeCompare(b.meta.branch, undefined, { sensitivity: "base" });
  });

  return sessions;
}

function countProtectedWorktrees(): number {
  try {
    const data = JSON.parse(fs.readFileSync(PROTECTED_WORKTREES_FILE, "utf-8"));
    return Array.isArray(data?.paths) ? data.paths.length : 0;
  } catch {
    return 0;
  }
}

// Shallow-compare two session lists by content so the watcher can skip a
// re-render when a file change did not actually alter the displayed data
// (e.g. a log/artifact touch, or an agent_state rewrite with the same value).
function sessionsEqual(a: SessionData[], b: SessionData[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.name !== y.name ||
      x.status !== y.status ||
      x.workflow !== y.workflow ||
      x.description !== y.description ||
      x.currentStep !== y.currentStep ||
      x.stateMtimeMs !== y.stateMtimeMs ||
      x.tmuxAlive !== y.tmuxAlive ||
      x.agentState.state !== y.agentState.state ||
      x.agentState.reason !== y.agentState.reason
    ) {
      return false;
    }
  }
  return true;
}

// Async version - runs in background without blocking the event loop
function countCleanableWorktreesAsync(callback: (count: number) => void): void {
  exec("fed clean --dry-run", { encoding: "utf-8" }, (err, stdout) => {
    if (err) {
      callback(0);
      return;
    }
    const match = stdout.match(/^Found (\d+) worktree/m);
    callback(match ? parseInt(match[1], 10) : 0);
  });
}

export function useSessions() {
  const [sessions, setSessions] = useState<SessionData[]>(() => loadSessions());
  const [cleanableCount, setCleanableCount] = useState<number>(0);
  const [protectedCount, setProtectedCount] = useState<number>(() => countProtectedWorktrees());

  // Fetch cleanable count asynchronously on mount
  useEffect(() => {
    countCleanableWorktreesAsync(setCleanableCount);
  }, []);

  // Fast refresh: only reload session list (sync file reads, very fast).
  // Keep the previous array reference when content is unchanged so React
  // bails out of the re-render — avoids dashboard flicker on every file event.
  const refreshSessions = useCallback(() => {
    setSessions((prev) => {
      const next = loadSessions();
      return sessionsEqual(prev, next) ? prev : next;
    });
  }, []);

  // Slow refresh: update cleanable count in background (non-blocking)
  const refreshCleanableCount = useCallback(() => {
    countCleanableWorktreesAsync(setCleanableCount);
  }, []);

  // Full refresh: fast session reload + background cleanable count + protected count
  const refresh = useCallback(() => {
    setSessions((prev) => {
      const next = loadSessions();
      return sessionsEqual(prev, next) ? prev : next;
    });
    setProtectedCount(countProtectedWorktrees());
    countCleanableWorktreesAsync(setCleanableCount);
  }, []);

  return { sessions, refresh, refreshSessions, refreshCleanableCount, cleanableCount, protectedCount };
}
