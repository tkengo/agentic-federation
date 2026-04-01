import path from "node:path";
import fs from "node:fs";
import { WORKFLOWS_DIR } from "../lib/paths.js";
import { loadV2Workflow } from "../lib/engine-v2/workflow-loader.js";

/** Validate a v2 workflow definition and report errors. */
export function workflowValidateCommand(name: string): void {
  const v2Path = path.join(WORKFLOWS_DIR, name, "workflow-v2.yaml");
  if (!fs.existsSync(v2Path)) {
    console.error(`Workflow not found: ${name} (expected ${v2Path})`);
    process.exit(1);
  }
  try {
    loadV2Workflow(v2Path);
    console.log(`Valid: workflow "${name}" passed all checks.`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Validation error for "${name}":\n  ${msg}`);
    process.exit(1);
  }
}
