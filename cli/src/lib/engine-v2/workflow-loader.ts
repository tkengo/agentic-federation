import fs from "node:fs";
import { parse as parseYaml } from "yaml";
import type { V2Workflow, V2Step } from "./types.js";

const VALID_STEP_TYPES = new Set([
  "claude", "codex", "shell", "human", "loop", "branch", "parallel",
]);

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

  // Validate each step
  const seenIds = new Set<string>();
  for (let i = 0; i < workflow.steps.length; i++) {
    validateStep(workflow.steps[i], `steps[${i}]`, seenIds);
  }

  return workflow;
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
