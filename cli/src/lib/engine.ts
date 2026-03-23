import fs from "node:fs";
import path from "node:path";
import type { StateJson } from "./types.js";
import {
  loadSessionWorkflow,
  type WorkflowDefinition,
  type WorkflowState,
} from "./workflow.js";
import { acquireLock } from "./filelock.js";
import { readMeta } from "./session.js";
import { notifyHumanCommand } from "../commands/notify-human.js";

export interface TransitionResult {
  transitioned: boolean;
  newState?: string;
  notifiedPanes?: string[];
  error?: string;
}

/**
 * Complete a task in the current state and optionally trigger a transition.
 *
 * 1. Remove this pane from pending_tasks
 * 2. If pending_tasks is now empty, evaluate transitions using resultCode
 * 3. If a valid transition exists, update status and dispatch next state's tasks
 */
export async function completeTransition(
  sessionDir: string,
  paneId: string,
  resultCode: string,
): Promise<TransitionResult> {
  const statePath = path.join(sessionDir, "state.json");
  const release = await acquireLock(statePath);

  try {
    const state = JSON.parse(
      fs.readFileSync(statePath, "utf-8")
    ) as StateJson;
    const workflow = loadSessionWorkflow(sessionDir);
    if (!workflow) {
      return { transitioned: false, error: "No workflow.yaml found in session directory" };
    }

    const currentStateDef = workflow.states[state.status];
    if (!currentStateDef) {
      return { transitioned: false, error: `Unknown current state: ${state.status}` };
    }

    // Remove this pane from pending_tasks (if present)
    const idx = state.pending_tasks.indexOf(paneId);
    if (idx >= 0) {
      state.pending_tasks.splice(idx, 1);

      // If tasks still pending, just save and return
      if (state.pending_tasks.length > 0) {
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
        appendHistory(sessionDir, "task_complete", state.status, `${paneId}: ${resultCode} (waiting for ${state.pending_tasks.length} more)`);
        return { transitioned: false };
      }
    } else if (state.pending_tasks.length > 0) {
      // Pane is not in pending_tasks, but other tasks are still pending
      return {
        transitioned: false,
        error: `Pane "${paneId}" is not in pending_tasks. Current pending: [${state.pending_tasks.join(", ")}]`,
      };
    }
    // If we reach here: all pending tasks completed OR no tasks were defined

    // All tasks done - evaluate transition
    const transitions = currentStateDef.transitions;
    if (!transitions) {
      // Save state (pending_tasks cleared) and return
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
      return { transitioned: false, error: `No transitions defined for state "${state.status}"` };
    }

    const nextStateName = transitions[resultCode];
    if (!nextStateName) {
      // Restore pane to pending_tasks since transition failed
      state.pending_tasks.push(paneId);
      fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
      const validCodes = Object.keys(transitions).join(", ");
      return {
        transitioned: false,
        error: `Invalid result "${resultCode}" for state "${state.status}". Valid codes: ${validCodes}`,
      };
    }

    // Perform transition
    const prevStatus = state.status;
    state.status = nextStateName;

    // Dispatch tasks for the new state
    const notifiedPanes = dispatchTasks(sessionDir, workflow, nextStateName, state);

    // Save updated state
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
    appendHistory(sessionDir, "transition", nextStateName, `${prevStatus} -> ${nextStateName} (result: ${resultCode})`);

    // Handle wait_human on the new state
    const nextStateDef = workflow.states[nextStateName];
    if (nextStateDef?.wait_human) {
      setWaitingHuman(sessionDir, nextStateDef);
    }

    return { transitioned: true, newState: nextStateName, notifiedPanes };
  } finally {
    release();
  }
}

/**
 * Dispatch tasks for a state: register pending_tasks and send notifications.
 * Called when entering a new state that has tasks defined.
 */
export function dispatchTasks(
  sessionDir: string,
  workflow: WorkflowDefinition,
  stateName: string,
  state: StateJson,
): string[] {
  const stateDef = workflow.states[stateName];
  if (!stateDef?.tasks || stateDef.tasks.length === 0) {
    return [];
  }

  const paneIds: string[] = [];
  for (const task of stateDef.tasks) {
    paneIds.push(task.pane);

    // Build notification message
    const message = task.message
      ?? `'fed prompt read ${task.agent}' を実行して作業を開始してください。`;

    // Send notification to the pane
    sendNotify(sessionDir, workflow, task.pane, message);
  }

  state.pending_tasks = [...paneIds];
  return paneIds;
}

/**
 * Resolve pane ID to tmux target and write notification file.
 * Uses the same mechanism as `fed notify`.
 */
function sendNotify(
  sessionDir: string,
  workflow: WorkflowDefinition,
  paneId: string,
  message: string,
): void {
  const meta = readMeta(sessionDir);
  if (!meta) return;

  // Find the window and pane number for this pane ID
  let target = "";
  for (const win of workflow.windows) {
    const pane = win.panes.find((p) => p.id === paneId);
    if (pane) {
      target = `${meta.tmux_session}:${win.name}.${pane.pane}`;
      break;
    }
  }
  if (!target) {
    console.error(`Warning: Could not resolve pane ID "${paneId}" to tmux target`);
    return;
  }

  const notifyDir = path.join(sessionDir, "notifications");
  fs.mkdirSync(notifyDir, { recursive: true });
  const ts = Date.now();
  const notifyFile = path.join(notifyDir, `${ts}_${paneId}.notify`);
  fs.writeFileSync(notifyFile, `${target}\n${message}\n`);
}

/**
 * Set waiting-human state and send macOS notification.
 */
function setWaitingHuman(sessionDir: string, stateDef: WorkflowState): void {
  const filePath = path.join(sessionDir, "waiting_human.json");
  const reason = stateDef.description;
  const data = {
    waiting: true,
    reason,
    ts: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");

  // Send macOS notification
  notifyHumanCommand("WAITING", reason);
}

/**
 * Append an event to history.jsonl.
 */
function appendHistory(
  sessionDir: string,
  event: string,
  status: string,
  detail: string,
): void {
  const historyPath = path.join(sessionDir, "history.jsonl");
  const entry = {
    ts: new Date().toISOString(),
    event,
    field: "status",
    value: status,
    detail,
  };
  fs.appendFileSync(historyPath, JSON.stringify(entry) + "\n");
}
