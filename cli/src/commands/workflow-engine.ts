import fs from "node:fs";
import path from "node:path";
import { resolveSession, requireSessionDir } from "../lib/session.js";
import { initV2State } from "../lib/engine-v2/state.js";
import { runEngine } from "../lib/engine-v2/engine.js";

/**
 * `fed session start-engine [session-name]`
 *
 * Start the v2 engine directly in the current terminal.
 * By default, resumes from last completed step (skips completed steps).
 * With --reset, reinitializes state and starts from the beginning.
 */
export async function workflowEngineCommand(sessionName?: string, reset?: boolean): Promise<void> {
  // Resolve session
  let sessionPath: string;
  if (sessionName) {
    const resolved = resolveSession(sessionName);
    if (!resolved) {
      console.error(`Error: No active session found for '${sessionName}'.`);
      process.exit(1);
    }
    sessionPath = resolved;
  } else {
    sessionPath = requireSessionDir();
  }

  // v2 only
  const workflowYamlPath = path.join(sessionPath, "workflow-v2.yaml");
  if (!fs.existsSync(workflowYamlPath)) {
    console.error("Error: workflow-v2.yaml not found. Only v2 sessions are supported.");
    process.exit(1);
  }

  // Reset state if requested
  if (reset) {
    console.log("Resetting state-v2.json...");
    initV2State(sessionPath);

    // Clear respond files
    const respondDir = path.join(sessionPath, "respond");
    if (fs.existsSync(respondDir)) {
      for (const f of fs.readdirSync(respondDir)) {
        fs.unlinkSync(path.join(respondDir, f));
      }
    }
    console.log("State reset complete.");
  }

  console.log(reset ? "Starting engine from beginning..." : "Starting engine (resuming from last completed step)...");
  await runEngine(sessionPath);
}
