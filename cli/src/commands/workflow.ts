import fs from "node:fs";
import path from "node:path";
import { WORKFLOWS_DIR } from "../lib/paths.js";
import { getCurrentTmuxSession, resolveSession } from "../lib/session.js";
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

/** Show the YAML content of a workflow.
 *  If inside a session, prefer the session-local expanded workflow.yaml. */
export function workflowShowCommand(name: string): void {
  // Try session-local expanded copy first
  const tmuxSession = getCurrentTmuxSession();
  if (tmuxSession) {
    const sessionDir = resolveSession(tmuxSession);
    if (sessionDir) {
      const sessionWf = path.join(sessionDir, "workflow.yaml");
      if (fs.existsSync(sessionWf)) {
        process.stdout.write(fs.readFileSync(sessionWf, "utf-8"));
        return;
      }
    }
  }

  // Fall back to source workflows directory
  const filePath = path.join(WORKFLOWS_DIR, name, "workflow.yaml");
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
