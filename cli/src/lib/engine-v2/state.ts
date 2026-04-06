import fs from "node:fs";
import path from "node:path";
import { acquireLock } from "../filelock.js";
import type { V2State, V2Status, V2HistoryEntry } from "./types.js";

const STATE_FILENAME = "state-v2.json";

function statePath(sessionDir: string): string {
  return path.join(sessionDir, STATE_FILENAME);
}

/**
 * Create initial state-v2.json for a new session.
 */
export function initV2State(sessionDir: string): V2State {
  const state: V2State = {
    current_step: null,
    status: "running",
    results: {},
    sessions: {},
    loops: {},
    history: [],
  };
  fs.writeFileSync(statePath(sessionDir), JSON.stringify(state, null, 2) + "\n");
  return state;
}

/**
 * Read current v2 state.
 */
export function readV2State(sessionDir: string): V2State {
  const fp = statePath(sessionDir);
  if (!fs.existsSync(fp)) {
    throw new Error(`State file not found: ${fp}`);
  }
  const state = JSON.parse(fs.readFileSync(fp, "utf-8")) as V2State;
  // Backward compatibility: ensure sessions and loops fields exist
  if (!state.sessions) {
    state.sessions = {};
  }
  if (!state.loops) {
    state.loops = {};
  }
  return state;
}

/**
 * Write v2 state (no locking - caller must hold lock if needed).
 */
export function writeV2State(sessionDir: string, state: V2State): void {
  fs.writeFileSync(statePath(sessionDir), JSON.stringify(state, null, 2) + "\n");
}

/**
 * Update state with file lock (for external callers like `fed session respond-workflow`).
 */
export async function updateV2StateWithLock(
  sessionDir: string,
  updater: (state: V2State) => void,
): Promise<V2State> {
  const fp = statePath(sessionDir);
  const release = await acquireLock(fp);
  try {
    const state = readV2State(sessionDir);
    updater(state);
    writeV2State(sessionDir, state);
    return state;
  } finally {
    release();
  }
}

/**
 * Record a step result in the state.
 */
export function setStepResult(
  state: V2State,
  stepPath: string,
  value: string,
): void {
  state.results[stepPath] = {
    value,
    completed_at: new Date().toISOString(),
  };
}

/**
 * Clear all descendant step results under the given path prefix.
 * Used by loop iterations to allow re-execution of child steps.
 */
export function clearDescendantResults(
  state: V2State,
  pathPrefix: string,
): string[] {
  const cleared: string[] = [];
  const prefix = pathPrefix + ".";
  for (const key of Object.keys(state.results)) {
    if (key.startsWith(prefix)) {
      delete state.results[key];
      cleared.push(key);
    }
  }
  return cleared;
}

/**
 * Save current loop iteration for resume.
 */
export function setLoopIteration(
  state: V2State,
  stepPath: string,
  iteration: number,
): void {
  state.loops[stepPath] = { iteration };
}

/**
 * Get saved loop iteration (for resume). Returns undefined if not saved.
 */
export function getLoopIteration(
  state: V2State,
  stepPath: string,
): number | undefined {
  return state.loops[stepPath]?.iteration;
}

/**
 * Clear loop iteration tracking (after loop completes).
 */
export function clearLoopIteration(
  state: V2State,
  stepPath: string,
): void {
  delete state.loops[stepPath];
}

/**
 * Store agent session ID for a step (for resume on loop re-execution).
 */
export function setSessionId(
  state: V2State,
  stepPath: string,
  sessionId: string,
): void {
  state.sessions[stepPath] = sessionId;
}

/**
 * Get stored session ID for a step.
 */
export function getSessionId(
  state: V2State,
  stepPath: string,
): string | undefined {
  return state.sessions[stepPath];
}

/**
 * Append a history entry.
 */
export function appendHistory(
  state: V2State,
  event: string,
  step: string,
  detail?: string,
): void {
  const entry: V2HistoryEntry = {
    ts: new Date().toISOString(),
    event,
    step,
  };
  if (detail) entry.detail = detail;
  state.history.push(entry);
}

/**
 * Update engine status.
 */
export function setStatus(state: V2State, status: V2Status): void {
  state.status = status;
}

/**
 * Set current step path.
 */
export function setCurrentStep(state: V2State, stepPath: string | null): void {
  state.current_step = stepPath;
}
