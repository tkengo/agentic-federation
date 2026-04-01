import fs from "node:fs";
import path from "node:path";
import { resolveSession, readMeta, requireSessionDir } from "../lib/session.js";
import * as tmux from "../lib/tmux.js";
import { initV2State } from "../lib/engine-v2/state.js";

/**
 * `fed workflow engine [session-name]`
 *
 * Start the v2 engine in the engine pane.
 * By default, resumes from last completed step (skips completed steps).
 * With --reset, reinitializes state and starts from the beginning.
 */
export function workflowEngineCommand(sessionName?: string, reset?: boolean): void {
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

  // Read meta.json
  const meta = readMeta(sessionPath);
  if (!meta) {
    console.error(`Error: No meta.json found in ${sessionPath}`);
    process.exit(1);
  }

  const tmuxSession = meta.tmux_session;

  // tmux session must exist (recover first if not)
  if (!tmux.hasSession(tmuxSession)) {
    console.error(`Error: tmux session '${tmuxSession}' does not exist.`);
    console.error("Run 'fed session recover' first to rebuild the tmux session.");
    process.exit(1);
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

  // Send engine start command to the engine pane
  const engineScript = path.resolve(import.meta.dirname, "..", "lib", "engine-v2", "engine.js");
  const engineCmd = `node ${engineScript} ${sessionPath}`;

  console.log(reset ? "Starting engine from beginning..." : "Starting engine (resuming from last completed step)...");
  tmux.sendKeys(`${tmuxSession}:engine.1`, engineCmd);

  console.log("Engine command sent to engine pane.");
}
