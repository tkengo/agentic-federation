import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";

// ---- Type definitions ----

export interface WorkflowDefinition {
  name: string;
  description: string;
  panes: WorkflowPane[];
  layout: WorkflowLayout;
  states: Record<string, WorkflowState>;
}

export interface WorkflowPane {
  id: string;
  name: string;
  pane: number;
  command: string | null;
}

export interface WorkflowLayout {
  window_name: string;
  splits: LayoutSplit[];
  focus: number;
}

export interface LayoutSplit {
  source: number;
  direction: "h" | "v";
  percent: number;
}

export interface TaskDef {
  pane: string;
  tracking_key: string;
  message: string;
  input_artifacts?: string[];
  output_artifact?: string;
}

export interface WorkflowState {
  description: string;
  entry_point?: boolean;
  terminal?: boolean;
  on_enter?: string;
  on_task_complete?: string;
  tasks?: TaskDef[];
  decision_logic: string;
  cleanup_artifacts?: string[];
  transitions: string[];
}

// ---- Paths ----

const WORKFLOWS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "workflows"
);

// ---- Loader functions ----

/** Load and validate a workflow from an arbitrary file path. */
export function loadWorkflow(filePath: string): WorkflowDefinition {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workflow file not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  const wf = parseYaml(raw) as WorkflowDefinition;
  const errors = validateWorkflow(wf);
  if (errors.length > 0) {
    throw new Error(
      `Workflow validation failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`
    );
  }
  return wf;
}

/** Load a workflow by name from the workflows/ directory. */
export function loadWorkflowByName(name: string): WorkflowDefinition {
  const filePath = path.join(WORKFLOWS_DIR, `${name}.yaml`);
  return loadWorkflow(filePath);
}

/** Load the workflow.yaml from a session directory. Returns null if not found. */
export function loadSessionWorkflow(
  sessionDir: string
): WorkflowDefinition | null {
  const filePath = path.join(sessionDir, "workflow.yaml");
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return loadWorkflow(filePath);
}

/** List available workflow names from the workflows/ directory. */
export function listWorkflows(): string[] {
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.replace(/\.yaml$/, ""));
}

// ---- Utility functions ----

/** Get the entry point state name (the one with entry_point: true). */
export function getEntryPointState(wf: WorkflowDefinition): string {
  for (const [name, state] of Object.entries(wf.states)) {
    if (state.entry_point) {
      return name;
    }
  }
  throw new Error("No entry point state found in workflow");
}

/** Get all terminal state names (those with terminal: true). */
export function getTerminalStates(wf: WorkflowDefinition): string[] {
  return Object.entries(wf.states)
    .filter(([, state]) => state.terminal)
    .map(([name]) => name);
}

// ---- Validation ----

/** Validate a workflow definition. Returns an array of error messages (empty = valid). */
export function validateWorkflow(wf: WorkflowDefinition): string[] {
  const errors: string[] = [];

  if (!wf) {
    return ["Workflow definition is empty or null"];
  }

  // Check required top-level fields
  if (!wf.name) errors.push("Missing required field: name");
  if (!wf.description) errors.push("Missing required field: description");
  if (!Array.isArray(wf.panes) || wf.panes.length === 0) {
    errors.push("Missing or empty field: panes");
  }
  if (!wf.layout) errors.push("Missing required field: layout");
  if (!wf.states || typeof wf.states !== "object") {
    errors.push("Missing or invalid field: states");
  }

  // If basic structure is invalid, return early
  if (errors.length > 0) return errors;

  const paneIds = new Set(wf.panes.map((p) => p.id));
  const stateNames = new Set(Object.keys(wf.states));

  // Validate pane ids
  for (const pane of wf.panes) {
    if (!pane.id) {
      errors.push("Pane missing required field: id");
    }
  }

  // Validate duplicate pane ids
  const seenIds = new Set<string>();
  for (const pane of wf.panes) {
    if (seenIds.has(pane.id)) {
      errors.push(`Duplicate pane id: "${pane.id}"`);
    }
    seenIds.add(pane.id);
  }

  // Validate states
  let entryPointCount = 0;
  for (const [stateName, state] of Object.entries(wf.states)) {
    if (state.entry_point) entryPointCount++;

    // Validate transitions reference existing states
    if (state.transitions) {
      for (const target of state.transitions) {
        if (!stateNames.has(target)) {
          errors.push(
            `State "${stateName}": transition target "${target}" not found in states`
          );
        }
      }
    }

    // Validate tasks reference existing panes
    if (state.tasks) {
      for (const task of state.tasks) {
        if (!paneIds.has(task.pane)) {
          errors.push(
            `State "${stateName}": task pane "${task.pane}" not found in panes`
          );
        }
      }
    }
  }

  // Exactly one entry point
  if (entryPointCount === 0) {
    errors.push("No state has entry_point: true");
  } else if (entryPointCount > 1) {
    errors.push(
      `Multiple states have entry_point: true (expected exactly 1, found ${entryPointCount})`
    );
  }

  return errors;
}
