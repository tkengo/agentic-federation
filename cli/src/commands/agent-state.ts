import fs from "node:fs";
import path from "node:path";
import { getCurrentTmuxSession, resolveSession, requireSessionDir } from "../lib/session.js";
import { notifyHumanCommand } from "./notify-human.js";
import { log } from "../lib/logger.js";

export type AgentStateValue = "processing" | "idle" | "waiting_human";

interface AgentStateJson {
  state: AgentStateValue;
  reason: string | null;
  ts: string;
}

// Legacy schema (waiting_human.json) read for backward compatibility with
// in-flight sessions created before the agent-state command existed.
interface LegacyWaitingHumanJson {
  waiting: boolean;
  reason: string | null;
  ts: string;
}

const NEW_FILE = "agent_state.json";
const LEGACY_FILE = "waiting_human.json";

function resolveCurrentSessionDir(label: string): string | null {
  // Silently exit 0 if not in a fed session (for hook safety).
  const tmuxSession = getCurrentTmuxSession();
  if (!tmuxSession) {
    log(`[${label}] skipped: no tmux session detected (FED_SESSION and TMUX both unset)`);
    return null;
  }
  const sessionDir = resolveSession(tmuxSession);
  if (!sessionDir) {
    log(`[${label}] skipped: no active session for tmux="${tmuxSession}"`);
    return null;
  }
  return sessionDir;
}

export function readAgentState(sessionDir: string): AgentStateJson | null {
  const newPath = path.join(sessionDir, NEW_FILE);
  if (fs.existsSync(newPath)) {
    try {
      return JSON.parse(fs.readFileSync(newPath, "utf-8")) as AgentStateJson;
    } catch {
      return null;
    }
  }
  const legacyPath = path.join(sessionDir, LEGACY_FILE);
  if (fs.existsSync(legacyPath)) {
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf-8")) as LegacyWaitingHumanJson;
      return {
        state: legacy.waiting ? "waiting_human" : "idle",
        reason: legacy.reason,
        ts: legacy.ts,
      };
    } catch {
      return null;
    }
  }
  return null;
}

function writeState(sessionDir: string, state: AgentStateValue, reason: string | null): void {
  const data: AgentStateJson = {
    state,
    reason,
    ts: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(sessionDir, NEW_FILE), JSON.stringify(data, null, 2) + "\n");
}

export function agentStateProcessingCommand(): void {
  const sessionDir = resolveCurrentSessionDir("agent-state processing");
  if (!sessionDir) return;
  writeState(sessionDir, "processing", null);
  console.log("Set agent_state: processing");
}

export function agentStateIdleCommand(reason: string | null): void {
  const sessionDir = resolveCurrentSessionDir("agent-state idle");
  if (!sessionDir) return;
  // Don't override waiting_human — Claude explicitly set it before stopping,
  // and Stop hook firing afterward should not silently downgrade it.
  const current = readAgentState(sessionDir);
  if (current?.state === "waiting_human") {
    log(`[agent-state idle] kept waiting_human; not downgrading`);
    return;
  }
  writeState(sessionDir, "idle", reason);
  console.log(`Set agent_state: idle${reason ? ` (${reason})` : ""}`);
}

export function agentStateWaitingCommand(reason: string, notify: boolean): void {
  const sessionDir = resolveCurrentSessionDir("agent-state waiting");
  if (!sessionDir) return;
  writeState(sessionDir, "waiting_human", reason);
  console.log(`Set agent_state: waiting_human (${reason})`);
  if (notify) {
    notifyHumanCommand("WAITING", reason);
  }
}

export function agentStateClearCommand(): void {
  const sessionDir = resolveCurrentSessionDir("agent-state clear");
  if (!sessionDir) return;
  writeState(sessionDir, "idle", null);
  console.log("Cleared agent_state (set to idle)");
}

export function agentStateShowCommand(): void {
  const sessionDir = requireSessionDir();
  const state = readAgentState(sessionDir);
  if (!state) {
    console.log(JSON.stringify({ state: "idle", reason: null, ts: null }, null, 2));
    return;
  }
  console.log(JSON.stringify(state, null, 2));
}
