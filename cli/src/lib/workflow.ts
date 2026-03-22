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
  agent: string;
  message?: string;
}

export interface WorkflowState {
  description: string;
  mark?: string;
  color?: string;
  entry_point?: boolean;
  terminal?: boolean;
  wait_human?: boolean;
  tasks?: TaskDef[];
  transitions?: Record<string, string>;
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

      // Validate tasks reference existing panes and have agent names
      if (state.tasks) {
        for (const task of state.tasks) {
          if (!paneIds.has(task.pane)) {
            errors.push(
              `State "${stateName}": task pane "${task.pane}" not found in panes`
            );
          }
          if (task.agent !== undefined && !task.agent) {
            errors.push(
              `State "${stateName}": task for pane "${task.pane}" has empty agent name`
            );
          }
        }
      }

      // Validate transitions reference existing state names
      if (state.transitions) {
        for (const [resultCode, targetState] of Object.entries(state.transitions)) {
          if (!stateNames.has(targetState)) {
            errors.push(
              `State "${stateName}": transition "${resultCode}" targets unknown state "${targetState}"`
            );
          }
        }
      }

      // Warn: terminal states should not have transitions
      if (state.terminal && state.transitions && Object.keys(state.transitions).length > 0) {
        errors.push(
          `State "${stateName}": terminal state should not have transitions`
        );
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

// ---- @include() expansion ----

// Regex patterns for @include directives
const RE_INCLUDE = /^@include\(([^)]+)\)\s*$/;
const RE_SLOT = /^@slot\(([a-zA-Z0-9-]+)\)\s*$/;
const RE_ENDSLOT = /^@endslot\s*$/;
const RE_ENDINCLUDE = /^@endinclude\s*$/;

/**
 * Read an included file with security checks.
 * Returns file content or null if rejected/missing.
 */
function readIncludeFile(filePath: string, baseDir: string): string | null {
  const trimmed = filePath.trim();

  // Security: reject absolute paths and path traversal
  if (path.isAbsolute(trimmed) || trimmed.includes("..")) {
    console.error(`Warning: @include path rejected (must be relative, no ..): ${trimmed}`);
    return null;
  }

  const resolved = path.resolve(baseDir, trimmed);
  if (!fs.existsSync(resolved)) {
    console.error(`Warning: @include file not found: ${resolved}`);
    return null;
  }
  return fs.readFileSync(resolved, "utf-8").trimEnd();
}

/**
 * Apply slot overrides to fragment content.
 * Replaces @slot(name)...@endslot blocks in the fragment with override content
 * or keeps the default content if no override is provided.
 */
function applySlotOverrides(
  fragmentContent: string,
  overrides: Record<string, string>,
  fragmentPath: string
): string {
  const lines = fragmentContent.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const slotMatch = lines[i].match(RE_SLOT);
    if (!slotMatch) {
      result.push(lines[i]);
      i++;
      continue;
    }

    const slotName = slotMatch[1];
    // Collect default content until @endslot
    const defaultLines: string[] = [];
    i++;
    while (i < lines.length && !RE_ENDSLOT.test(lines[i])) {
      defaultLines.push(lines[i]);
      i++;
    }
    // Skip @endslot line
    if (i < lines.length) i++;

    if (slotName in overrides) {
      // Use override content
      result.push(overrides[slotName]);
    } else if (defaultLines.length > 0) {
      // Use default content
      result.push(...defaultLines);
    } else {
      // No default and no override: warn and emit empty
      console.error(`Warning: slot "${slotName}" has no default and no override in ${fragmentPath}`);
    }
  }

  return result.join("\n");
}

/**
 * Expand @include() directives in agent instruction content.
 *
 * Supports two forms:
 * 1. Simple (single-line): `@include(path)` - replaced with file contents
 * 2. Block (with slots):
 *    ```
 *    @include(path)
 *    @slot(name)
 *    override content
 *    @endslot
 *    @endinclude
 *    ```
 *
 * Fragment files can define slots with default content:
 *    ```
 *    @slot(name)
 *    default content
 *    @endslot
 *    ```
 *
 * Nesting is not supported - @include() inside included files is ignored.
 * Paths are relative to baseDir (fed repo root).
 */
export function expandIncludes(
  content: string,
  baseDir: string
): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const includeMatch = lines[i].match(RE_INCLUDE);
    if (!includeMatch) {
      result.push(lines[i]);
      i++;
      continue;
    }

    const filePath = includeMatch[1].trim();
    const includeLineIdx = i;
    i++;

    // Look ahead: is this a block include (with @slot/@endinclude)?
    const slotOverrides: Record<string, string> = {};
    let isBlock = false;
    const savedI = i;

    while (i < lines.length) {
      if (RE_ENDINCLUDE.test(lines[i])) {
        isBlock = true;
        i++; // skip @endinclude
        break;
      }

      const slotMatch = lines[i].match(RE_SLOT);
      if (slotMatch) {
        isBlock = true;
        const slotName = slotMatch[1];
        const slotLines: string[] = [];
        i++;
        while (i < lines.length && !RE_ENDSLOT.test(lines[i])) {
          slotLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++; // skip @endslot
        slotOverrides[slotName] = slotLines.join("\n");
        continue;
      }

      // Not a @slot or @endinclude: this is a simple include, rewind
      break;
    }

    if (!isBlock) {
      // Rewind - simple single-line include
      i = savedI;
    }

    // Read and expand the included file
    const fileContent = readIncludeFile(filePath, baseDir);
    if (fileContent === null) {
      const errorComment = path.isAbsolute(filePath) || filePath.includes("..")
        ? `<!-- @include rejected: ${filePath} -->`
        : `<!-- @include not found: ${filePath} -->`;
      result.push(errorComment);
      continue;
    }

    if (isBlock && Object.keys(slotOverrides).length > 0) {
      // Apply slot overrides to fragment content
      result.push(applySlotOverrides(fileContent, slotOverrides, filePath));
    } else {
      // No slots to override, just include as-is
      result.push(fileContent);
    }
  }

  return result.join("\n");
}

/**
 * Full compose pipeline for agent instructions:
 * 1. @include() expansion
 * 2. Template variable expansion ({{repo.*}}, {{meta.*}})
 */
export function composeAgentInstruction(
  content: string,
  fedRepoRoot: string,
  bindings: Record<string, unknown>
): string {
  let result = expandIncludes(content, fedRepoRoot);
  result = expandTemplateVariables(result, bindings);
  return result;
}

// ---- Workflow overrides ----

import type { WorkflowOverride } from "./types.js";

/**
 * Apply repo-specific workflow overrides to a WorkflowDefinition.
 * Currently supports pane command overrides only.
 */
export function applyWorkflowOverrides(
  workflow: WorkflowDefinition,
  overrides: WorkflowOverride
): WorkflowDefinition {
  if (!overrides.windows) return workflow;

  const result = structuredClone(workflow);
  for (const win of result.windows) {
    const winOverride = overrides.windows[win.name];
    if (!winOverride?.panes) continue;
    for (const pane of win.panes) {
      const paneOverride = winOverride.panes[pane.id];
      if (paneOverride?.command !== undefined) {
        pane.command = paneOverride.command;
      }
    }
  }
  return result;
}
