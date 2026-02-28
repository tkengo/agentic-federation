import { useState, useCallback, useEffect } from "react";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { parse as parseYaml } from "yaml";
import { ACTIVE_DIR } from "../utils/types.js";
import type { MetaJson, StateJson, SessionData, StatusConfig, WaitingHumanData } from "../utils/types.js";

function readMeta(sessionDir: string): MetaJson | null {
  try {
    const meta = JSON.parse(
      fs.readFileSync(path.join(sessionDir, "meta.json"), "utf-8")
    ) as MetaJson;
    // Backward compat: old format has mode, no workflow
    if (!meta.workflow && meta.mode) {
      if (meta.mode === "team") {
        // Try to get workflow from state.json
        const state = readState(sessionDir);
        meta.workflow = state?.workflow ?? "dev-team";
      } else {
        meta.workflow = "solo";
      }
    }
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
    const wfPath = path.join(sessionDir, "workflow.yaml");
    if (!fs.existsSync(wfPath)) return undefined;
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

    // Read state.json mtime for staleness detection
    // Skip staleness tracking when status is empty (stateless workflows)
    let stateMtimeMs: number | undefined;
    const statusValue = state?.status ?? "";
    if (statusValue) {
      try {
        const stateFile = path.join(sessionDir, "state.json");
        const stat = fs.statSync(stateFile);
        stateMtimeMs = stat.mtimeMs;
      } catch {
        // state.json may not exist
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
      stateMtimeMs,
      statusConfigMap: readStatusConfig(sessionDir),
    });
  }

  return sessions;
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

  // Full refresh: fast session reload + background cleanable count
  const refresh = useCallback(() => {
    setSessions(loadSessions());
    countCleanableWorktreesAsync(setCleanableCount);
  }, []);

  return { sessions, refresh, refreshSessions, refreshCleanableCount, cleanableCount };
}
