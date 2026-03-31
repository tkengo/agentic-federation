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
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as V2State;
}

/**
 * Write v2 state (no locking - caller must hold lock if needed).
 */
export function writeV2State(sessionDir: string, state: V2State): void {
  fs.writeFileSync(statePath(sessionDir), JSON.stringify(state, null, 2) + "\n");
}

/**
 * Update state with file lock (for external callers like `fed workflow respond`).
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
