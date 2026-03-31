import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";
import { readV2State, updateV2StateWithLock, setStepResult, appendHistory } from "../lib/engine-v2/state.js";

/**
 * `fed workflow respond <value> [--step <path>]`
 *
 * Write a step result for the engine to consume.
 * If value is omitted, reads and displays the current result for the step.
 */
export async function workflowRespondCommand(
  value: string | undefined,
  stepOpt: string | undefined,
): Promise<void> {
  const sessionDir = requireSessionDir();

  // Resolve step path: --step > FED_STEP env > current_step from state-v2.json
  let stepPath = stepOpt ?? process.env.FED_STEP;
  if (!stepPath) {
    try {
      const state = readV2State(sessionDir);
      if (state.current_step) {
        stepPath = state.current_step;
      }
    } catch {
      // state-v2.json may not exist
    }
  }
  if (!stepPath) {
    console.error("Error: No step path. Provide --step, set FED_STEP, or ensure engine is running.");
    process.exit(1);
  }

  // Read mode (no value)
  if (value === undefined) {
    try {
      const state = readV2State(sessionDir);
      const result = state.results[stepPath];
      if (result) {
        console.log(result.value);
      } else {
        console.log("(no result)");
      }
    } catch {
      console.error("Error: No state-v2.json found. Is this a v2 workflow session?");
      process.exit(1);
    }
    return;
  }

  // Write mode: create respond file for engine to pick up
  const respondDir = path.join(sessionDir, "respond");
  fs.mkdirSync(respondDir, { recursive: true });

  const safeStepPath = stepPath.replace(/[./]/g, "_");
  const respondFile = path.join(respondDir, `${safeStepPath}.respond`);

  fs.writeFileSync(respondFile, value + "\n");

  // Also record in state file
  try {
    await updateV2StateWithLock(sessionDir, (state) => {
      setStepResult(state, stepPath, value);
      appendHistory(state, "respond", stepPath, `value=${value}`);
    });
  } catch {
    // State file may not exist yet during engine startup; respond file is sufficient
  }

  console.log(`Responded: ${stepPath} = ${value}`);
}
