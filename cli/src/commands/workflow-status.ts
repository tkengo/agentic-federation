import fs from "node:fs";
import path from "node:path";
import {
  getCurrentTmuxSession,
  resolveSession,
} from "../lib/session.js";
import { readV2State } from "../lib/engine-v2/state.js";
import { loadV2Workflow } from "../lib/engine-v2/workflow-loader.js";
import { buildStepTree } from "../lib/engine-v2/dashboard/build-step-tree.js";
import type { StepNode, StepStatus } from "../lib/engine-v2/dashboard/types.js";
import type { V2State } from "../lib/engine-v2/types.js";
import { color } from "../lib/engine-v2/dashboard/renderer.js";

// Status icons for step display
const STATUS_ICONS: Record<StepStatus, string> = {
  completed: "✓",
  running: "◉",
  waiting_human: "◉",
  failed: "✗",
  skipped: "─",
  not_started: "◌",
};

// Color function per status
const STATUS_COLORS: Record<StepStatus, (s: string) => string> = {
  completed: color.green,
  running: color.boldCyan,
  waiting_human: color.yellow,
  failed: color.red,
  skipped: color.dim,
  not_started: color.dim,
};

// Apply state results and current_step to the step tree nodes
function applyState(nodes: StepNode[], state: V2State): void {
  for (const node of nodes) {
    const result = state.results[node.stepPath];
    if (result) {
      node.status = "completed";
      node.result = result.value;
    }
  }

  // Mark current step
  if (state.current_step) {
    for (const node of nodes) {
      if (node.stepPath === state.current_step) {
        node.status = state.status === "waiting_human" ? "waiting_human" : "running";
        break;
      }
    }
  }
}

// Print the workflow status to stdout
function printStatus(workflowName: string, state: V2State, nodes: StepNode[]): void {
  console.log(`Workflow: ${workflowName}`);
  console.log(`Status:  ${state.status}`);
  if (state.current_step) {
    console.log(`Step:    ${state.current_step}`);
  }
  console.log("");
  console.log("Steps:");

  for (const node of nodes) {
    const indent = "  ".repeat(node.depth + 1);
    const icon = STATUS_COLORS[node.status](STATUS_ICONS[node.status]);
    const typeBadge = `[${node.stepType}]`;
    const conditionLabel = node.condition ? ` (${node.condition})` : "";
    const resultLabel = node.result ? ` → ${node.result}` : "";

    console.log(`${indent}${icon} ${node.label.padEnd(30 - node.depth * 2)} ${typeBadge}${conditionLabel}${resultLabel}`);
  }
}

export function workflowStatusCommand(sessionName?: string): void {
  // Resolve session
  const tmuxSession = sessionName ?? getCurrentTmuxSession();
  if (!tmuxSession) {
    console.error("Error: Not inside a tmux session and no session name provided.");
    process.exit(1);
  }
  const sessionDir = resolveSession(tmuxSession);
  if (!sessionDir) {
    console.error(`Error: No active session found for '${tmuxSession}'.`);
    process.exit(1);
  }

  // Read state-v2.json
  const stateFile = path.join(sessionDir, "state-v2.json");
  if (!fs.existsSync(stateFile)) {
    console.error("Error: No state-v2.json found. This session may not be using the v2 engine.");
    process.exit(1);
  }
  const state = readV2State(sessionDir);

  // Read workflow-v2.yaml
  const workflowPath = path.join(sessionDir, "workflow-v2.yaml");
  if (!fs.existsSync(workflowPath)) {
    console.error("Error: No workflow-v2.yaml found in session.");
    process.exit(1);
  }
  const workflow = loadV2Workflow(workflowPath);

  // Build step tree and apply state
  const nodes = buildStepTree(workflow);
  applyState(nodes, state);

  // Output
  printStatus(workflow.name, state, nodes);
}
