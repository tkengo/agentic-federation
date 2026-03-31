import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import type { V2Workflow, V2Window, V2Pane, V2LayoutSplit, V2LegacyWindow, V2Step } from "./types.js";

const VALID_STEP_TYPES = new Set([
  "claude", "codex", "shell", "human", "loop", "branch", "parallel",
]);

// Reserved window names that cannot be used in workflow definitions
const RESERVED_WINDOW_NAMES = new Set(["engine"]);

/**
 * Load and validate a v2 workflow YAML file.
 */
export function loadV2Workflow(filePath: string): V2Workflow {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow file not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf-8");
  const doc = parseYaml(raw) as Record<string, unknown>;

  if (!doc || typeof doc !== "object") {
    throw new Error(`Invalid workflow YAML: ${filePath}`);
  }

  const workflow = doc as unknown as V2Workflow;

  // Validate required fields
  if (!workflow.name || typeof workflow.name !== "string") {
    throw new Error("Workflow must have a 'name' field");
  }

  if (!Array.isArray(workflow.steps) || workflow.steps.length === 0) {
    throw new Error("Workflow must have at least one step");
  }

  // Validate windows
  if (workflow.windows && workflow.window) {
    throw new Error("Cannot specify both 'windows' and 'window'. Use 'windows' (the 'window' form is deprecated).");
  }

  // Convert legacy single-window to windows array
  if (workflow.window && !workflow.windows) {
    workflow.windows = convertLegacyWindow(workflow.window);
    delete workflow.window;
  }

  // Validate windows array
  if (workflow.windows) {
    validateWindows(workflow.windows);
  }

  // Validate focus references a valid window name
  if (workflow.focus) {
    if (!workflow.windows || !workflow.windows.some(w => w.name === workflow.focus)) {
      const available = workflow.windows?.map(w => w.name).join(", ") ?? "(none)";
      throw new Error(`focus '${workflow.focus}' does not match any window. Available: ${available}`);
    }
  }

  // Validate each step
  const seenIds = new Set<string>();
  for (let i = 0; i < workflow.steps.length; i++) {
    validateStep(workflow.steps[i], `steps[${i}]`, seenIds);
  }

  return workflow;
}

/**
 * Convert legacy `window` (single-window shorthand) to `windows` array.
 */
function convertLegacyWindow(legacy: V2LegacyWindow): V2Window[] {
  const panes: V2Pane[] = legacy.panes.map((p, i) => ({
    id: p.id,
    name: p.id,
    pane: i + 1,
    command: p.command,
  }));

  const splits: V2LayoutSplit[] = [];
  for (let i = 1; i < panes.length; i++) {
    splits.push({ source: 1, direction: "h", percent: 50 });
  }

  return [{
    name: "human",
    panes,
    layout: { splits, focus: 1 },
  }];
}

/**
 * Validate the windows array.
 */
function validateWindows(windows: V2Window[]): void {
  const seenWindowNames = new Set<string>();
  const seenPaneIds = new Set<string>();

  for (let i = 0; i < windows.length; i++) {
    const win = windows[i];
    const prefix = `windows[${i}]`;

    // Window name
    if (!win.name || typeof win.name !== "string") {
      throw new Error(`${prefix}: must have a 'name' field`);
    }
    if (RESERVED_WINDOW_NAMES.has(win.name)) {
      throw new Error(`${prefix}: window name '${win.name}' is reserved`);
    }
    if (seenWindowNames.has(win.name)) {
      throw new Error(`${prefix}: duplicate window name '${win.name}'`);
    }
    seenWindowNames.add(win.name);

    // Panes
    if (!Array.isArray(win.panes) || win.panes.length === 0) {
      throw new Error(`${prefix}: must have at least one pane`);
    }

    for (let j = 0; j < win.panes.length; j++) {
      const pane = win.panes[j];
      const panePrefix = `${prefix}.panes[${j}]`;

      if (!pane.id || typeof pane.id !== "string") {
        throw new Error(`${panePrefix}: must have an 'id' field`);
      }
      if (seenPaneIds.has(pane.id)) {
        throw new Error(`${panePrefix}: duplicate pane id '${pane.id}'`);
      }
      seenPaneIds.add(pane.id);

      if (typeof pane.pane !== "number" || pane.pane < 1) {
        throw new Error(`${panePrefix}: 'pane' must be a positive number`);
      }
    }

    // Layout
    if (!win.layout || typeof win.layout !== "object") {
      throw new Error(`${prefix}: must have a 'layout' field`);
    }
    if (!Array.isArray(win.layout.splits)) {
      throw new Error(`${prefix}.layout: must have a 'splits' array`);
    }
    if (typeof win.layout.focus !== "number") {
      throw new Error(`${prefix}.layout: must have a 'focus' number`);
    }
  }
}

function validateStep(step: V2Step, path: string, seenIds: Set<string>): void {
  if (!step.type || !VALID_STEP_TYPES.has(step.type)) {
    throw new Error(
      `${path}: invalid step type "${step.type}". Valid types: ${[...VALID_STEP_TYPES].join(", ")}`
    );
  }

  // Validate id uniqueness
  if (step.id !== undefined) {
    if (typeof step.id !== "string" || step.id.length === 0) {
      throw new Error(`${path}: step id must be a non-empty string`);
    }
    if (seenIds.has(step.id)) {
      throw new Error(`${path}: duplicate step id "${step.id}"`);
    }
    seenIds.add(step.id);
  }

  // Validate type-specific fields
  if (step.type === "claude" || step.type === "codex") {
    if (!step.agent) {
      throw new Error(`${path}: ${step.type} step must have an 'agent' field`);
    }
  }

  // Validate result declaration
  if (step.result) {
    if (!Array.isArray(step.result.values) || step.result.values.length === 0) {
      throw new Error(`${path}: result.values must be a non-empty array`);
    }
  }
}
