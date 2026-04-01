import { useState, useCallback, useEffect } from "react";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { ACTIVE_DIR, PROTECTED_WORKTREES_FILE } from "../utils/types.js";
import type { MetaJson, StateJson, SessionData, WaitingHumanData } from "../utils/types.js";
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

function readState(sessionDir: string): StateJson | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(sessionDir, "state.json"), "utf-8")
    ) as StateJson;
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

function readWaitingHuman(sessionDir: string): WaitingHumanData {
  try {
    const data = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "waiting_human.json"), "utf-8")
    ) as WaitingHumanData;
    return { waiting: data.waiting, reason: data.reason };
  } catch {
    return { waiting: false, reason: null };
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

    const state = readState(sessionDir);
    const v2State = readV2State(sessionDir);

    // Determine status: v1 state.json takes precedence, then v2 state-v2.json
    const statusValue = state?.status ?? v2State?.status ?? "";

    // Read state file mtime for staleness detection
    // Skip staleness tracking when status is empty (stateless workflows)
    let stateMtimeMs: number | undefined;
    if (statusValue) {
      // Use v2 state file when v2 session, otherwise v1
      const stateFile = v2State
        ? path.join(sessionDir, "state-v2.json")
        : path.join(sessionDir, "state.json");
      try {
        const stat = fs.statSync(stateFile);
        stateMtimeMs = stat.mtimeMs;
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
      pendingTasks: state?.pending_tasks ?? [],
      escalation: state?.escalation ?? { required: false, reason: null },
      waitingHuman: readWaitingHuman(sessionDir),
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

  // Fast refresh: only reload session list (sync file reads, very fast)
  const refreshSessions = useCallback(() => {
    setSessions(loadSessions());
  }, []);

  // Slow refresh: update cleanable count in background (non-blocking)
  const refreshCleanableCount = useCallback(() => {
    countCleanableWorktreesAsync(setCleanableCount);
  }, []);

  // Full refresh: fast session reload + background cleanable count + protected count
  const refresh = useCallback(() => {
    setSessions(loadSessions());
    setProtectedCount(countProtectedWorktrees());
    countCleanableWorktreesAsync(setCleanableCount);
  }, []);

  return { sessions, refresh, refreshSessions, refreshCleanableCount, cleanableCount, protectedCount };
}
