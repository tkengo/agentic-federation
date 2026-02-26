import fs from "node:fs";
import path from "node:path";
import {
  listWorkflows,
  loadWorkflowByName,
  validateWorkflow,
} from "../lib/workflow.js";

/** List available workflows from the workflows/ directory. */
export function workflowListCommand(): void {
  const names = listWorkflows();
  if (names.length === 0) {
    console.log("No workflows found.");
    return;
  }
  for (const name of names) {
    console.log(name);
  }
}

/** Show the YAML content of a workflow. */
export function workflowShowCommand(name: string): void {
  const WORKFLOWS_DIR = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "..",
    "workflows"
  );
  const filePath = path.join(WORKFLOWS_DIR, `${name}.yaml`);
  if (!fs.existsSync(filePath)) {
    console.error(`Workflow not found: ${name}`);
    process.exit(1);
  }
  const content = fs.readFileSync(filePath, "utf-8");
  process.stdout.write(content);
}

/** Validate a workflow definition and report errors. */
export function workflowValidateCommand(name: string): void {
  try {
    const wf = loadWorkflowByName(name);
    // loadWorkflowByName already validates, but let's show explicit results
    const errors = validateWorkflow(wf);
    if (errors.length === 0) {
      console.log(`Valid: workflow "${name}" passed all checks.`);
    } else {
      console.error(`Validation errors for "${name}":`);
      for (const err of errors) {
        console.error(`  - ${err}`);
      }
      process.exit(1);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(msg);
    process.exit(1);
  }
}
