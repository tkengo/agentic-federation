import { requireSessionDir } from "../lib/session.js";
import { readV2State } from "../lib/engine-v2/state.js";
import { writeAbortRequest } from "../lib/engine-v2/abort.js";

export function workflowAbortCommand(options: { graceful?: boolean }): void {
  const sessionDir = requireSessionDir();
  const state = readV2State(sessionDir);

  if (state.status !== "running" && state.status !== "waiting_human") {
    console.error(`Cannot abort: workflow is ${state.status}`);
    process.exit(1);
  }

  const mode = options.graceful ? "graceful" : "immediate";
  writeAbortRequest(sessionDir, mode);
  console.log(`Abort requested (${mode}). Current step: ${state.current_step ?? "(none)"}`);
}
