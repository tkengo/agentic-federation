import path from "node:path";
import { WORKFLOWS_DIR } from "../lib/paths.js";
import { loadV2Workflow } from "../lib/engine-v2/workflow-loader.js";
import { findWorkflowYaml } from "../lib/workflow-yaml.js";

/** Validate a workflow definition (v2 or v3) and report errors. */
export function workflowValidateCommand(name: string): void {
  const workflowDir = path.join(WORKFLOWS_DIR, name);
  const yamlPath = findWorkflowYaml(workflowDir);
  if (!yamlPath) {
    console.error(`Workflow not found: ${name} (expected ${workflowDir}/workflow-v3.yaml or workflow-v2.yaml)`);
    process.exit(1);
  }
  try {
    loadV2Workflow(yamlPath);
    console.log(`Valid: workflow "${name}" passed all checks.`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Validation error for "${name}":\n  ${msg}`);
    process.exit(1);
  }
}
