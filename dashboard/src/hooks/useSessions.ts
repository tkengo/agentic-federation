import { useState, useCallback, useEffect } from "react";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { ACTIVE_DIR, PROTECTED_WORKTREES_FILE } from "../utils/types.js";
import type { MetaJson, StateJson, SessionData, StatusConfig, WaitingHumanData } from "../utils/types.js";

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

function readStatusConfig(sessionDir: string): Record<string, StatusConfig> | undefined {
  try {
    let wfPath = path.join(sessionDir, "workflow.yaml");
    if (!fs.existsSync(wfPath)) {
      wfPath = path.join(sessionDir, "workflow-v2.yaml");
      if (!fs.existsSync(wfPath)) return undefined;
    }
    const raw = fs.readFileSync(wfPath, "utf-8");
    const wf = parseYaml(raw) as { states?: Record<string, { mark?: string; color?: string }> };
    if (!wf.states) return undefined;
    const map: Record<string, StatusConfig> = {};
    for (const [name, state] of Object.entries(wf.states)) {
      if (state.color) {
        map[name] = { mark: state.mark ?? "●", color: state.color };
      }
    }
    return Object.keys(map).length > 0 ? map : undefined;
  } catch {
    return undefined;
  }
}

// Default status config for v2 engine statuses
const V2_DEFAULT_STATUS_CONFIG: Record<string, StatusConfig> = {
  running: { mark: "▶", color: "cyan" },
  waiting_human: { mark: "◌", color: "yellow" },
  completed: { mark: "✓", color: "green" },
  failed: { mark: "✗", color: "red" },
};

function loadSessions(): SessionData[] {
  if (!fs.existsSync(ACTIVE_DIR)) return [];

  const entries = fs.readdirSync(ACTIVE_DIR);
  const sessions: SessionData[] = [];

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

    // For v2 sessions, merge default v2 status config with any workflow-defined config
    const workflowStatusConfig = readStatusConfig(sessionDir);
    const statusConfigMap = v2State
      ? { ...V2_DEFAULT_STATUS_CONFIG, ...workflowStatusConfig }
      : workflowStatusConfig;

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
      stateMtimeMs,
      statusConfigMap,
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
