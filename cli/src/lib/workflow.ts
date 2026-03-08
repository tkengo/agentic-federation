import fs from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { WORKFLOWS_DIR } from "./paths.js";

// ---- Type definitions ----

export interface WorkflowDefinition {
  name: string;
  description: string;
  focus?: string;
  windows: WorkflowWindow[];
  states: Record<string, WorkflowState>;
}

export interface WorkflowWindow {
  name: string;
  panes: WorkflowPane[];
  layout: {
    splits: LayoutSplit[];
    focus: number;
  };
}

export interface WorkflowPane {
  id: string;
  name: string;
  pane: number;
  command: string | null;
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
  mark?: string;
  color?: string;
  entry_point?: boolean;
  terminal?: boolean;
  on_enter?: string;
  on_task_complete?: string;
  tasks?: TaskDef[];
  decision_logic: string;
  cleanup_artifacts?: string[];
}

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
  const filePath = path.join(WORKFLOWS_DIR, name, "workflow.yaml");
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
    .filter((d) => {
      const dirPath = path.join(WORKFLOWS_DIR, d);
      return fs.statSync(dirPath).isDirectory()
        && fs.existsSync(path.join(dirPath, "workflow.yaml"));
    });
}

// ---- Utility functions ----

/** Get the entry point state name (the one with entry_point: true).
 *  Returns "" for stateless workflows (states is empty). */
export function getEntryPointState(wf: WorkflowDefinition): string {
  if (Object.keys(wf.states).length === 0) {
    return "";
  }
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
  if (!Array.isArray(wf.windows) || wf.windows.length === 0) {
    errors.push("Missing or empty field: windows");
  }
  if (!wf.states || typeof wf.states !== "object") {
    errors.push("Missing or invalid field: states");
  }

  // If basic structure is invalid, return early
  if (errors.length > 0) return errors;

  // Collect pane IDs across all windows for uniqueness
  const paneIds = new Set<string>();
  const seenIds = new Set<string>();

  for (const win of wf.windows) {
    if (!win.name) errors.push("Window missing required field: name");
    if (!Array.isArray(win.panes) || win.panes.length === 0) {
      errors.push(`Window "${win.name}": missing or empty panes`);
    }
    if (!win.layout) {
      errors.push(`Window "${win.name}": missing layout`);
    }

    for (const pane of win.panes) {
      if (!pane.id) {
        errors.push("Pane missing required field: id");
      }
      if (seenIds.has(pane.id)) {
        errors.push(`Duplicate pane id: "${pane.id}"`);
      }
      seenIds.add(pane.id);
      paneIds.add(pane.id);
    }
  }

  // Validate top-level focus references an existing window
  if (wf.focus) {
    const windowNames = new Set(wf.windows.map((w) => w.name));
    if (!windowNames.has(wf.focus)) {
      errors.push(`Top-level focus "${wf.focus}" does not match any window name`);
    }
  }

  const stateNames = new Set(Object.keys(wf.states));

  // Skip entry_point check when states is empty (stateless workflow)
  if (stateNames.size > 0) {
    let entryPointCount = 0;
    for (const [stateName, state] of Object.entries(wf.states)) {
      if (state.entry_point) entryPointCount++;

      // Validate tasks reference existing panes (global pane ID set)
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

    if (entryPointCount === 0) {
      errors.push("No state has entry_point: true");
    } else if (entryPointCount > 1) {
      errors.push(
        `Multiple states have entry_point: true (expected exactly 1, found ${entryPointCount})`
      );
    }
  }

  return errors;
}

// ---- Template expansion ----

/** Resolve a dotted path like "repo.extra.dev_server" against a bindings object. */
function resolveBinding(keyPath: string, bindings: Record<string, unknown>): string {
  const parts = keyPath.split(".");
  let current: unknown = bindings;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  if (current == null) return "";
  return String(current);
}

/** Expand {{path.to.value}} template variables in YAML content. */
export function expandTemplateVariables(
  yamlContent: string,
  bindings: Record<string, unknown>
): string {
  return yamlContent.replace(/\{\{([^}]+)\}\}/g, (_match, keyPath: string) => {
    return resolveBinding(keyPath.trim(), bindings);
  });
}
