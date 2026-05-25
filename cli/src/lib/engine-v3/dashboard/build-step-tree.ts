import type { V2Step, V2Workflow } from "../types.js";
import type { StepNode } from "./types.js";

/**
 * Build a flat list of StepNode rows from a V2Workflow definition.
 * Handles nested structures (loop sub-steps, branch cases, parallel branches).
 */
export function buildStepTree(workflow: V2Workflow): StepNode[] {
  const nodes: StepNode[] = [];
  flattenSteps(workflow.steps, "", 0, nodes);
  return nodes;
}

function flattenSteps(steps: V2Step[], parentPath: string, depth: number, nodes: StepNode[], condition?: string): void {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const name = step.id ?? `step_${i}`;
    const stepPath = parentPath ? `${parentPath}.${name}` : name;

    nodes.push({
      stepPath,
      label: name,
      stepType: step.type,
      depth,
      status: "not_started",
      description: step.description,
      condition,
    });

    // Recurse into nested structures
    if (step.type === "loop" && step.steps) {
      flattenSteps(step.steps, stepPath, depth + 1, nodes);
    }

    if (step.type === "branch" && step.cases) {
      for (let ci = 0; ci < step.cases.length; ci++) {
        const c = step.cases[ci];
        const condition = c.else ? "else" : c.if;
        if (c.steps) {
          flattenSteps(c.steps, stepPath, depth + 1, nodes, condition);
        }
      }
    }

    if (step.type === "parallel" && step.branches) {
      for (const branch of step.branches) {
        const branchPath = `${stepPath}.${branch.id}`;
        nodes.push({
          stepPath: branchPath,
          label: branch.id,
          stepType: branch.type,
          depth: depth + 1,
          status: "not_started",
          description: branch.description,
        });
      }
    }
  }
}
