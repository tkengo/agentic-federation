import fs from "node:fs";
import path from "node:path";
import { requireSessionDir } from "../lib/session.js";
import { readV2State, updateV2StateWithLock, setStepResult, appendHistory } from "../lib/engine-v2/state.js";
import { writeReplayRequest } from "../lib/engine-v2/replay.js";
import { writeAbortRequest } from "../lib/engine-v2/abort.js";
import { loadV2Workflow, collectStepPaths, resolveStepPath } from "../lib/engine-v2/workflow-loader.js";

/**
 * `fed session respond-workflow <value> [--step <path>] [--replay <step>] [--abort]`
 *
 * Write a step result for the engine to consume.
 * If value is omitted, reads and displays the current result for the step.
 * With --replay <step>, sends a replay request to the running engine.
 * With --abort, sends an abort request (immediate) to the running engine.
 */
export async function workflowRespondCommand(
  value: string | undefined,
  stepOpt: string | undefined,
  replayOpt: string | undefined,
  abortOpt: string | boolean | undefined,
): Promise<void> {
  const sessionDir = requireSessionDir();

  // --abort mode: send abort request to the running engine
  if (abortOpt) {
    if (value) {
      console.error("Error: --abort cannot be used with a result value.");
      process.exit(1);
    }
    if (replayOpt) {
      console.error("Error: --abort and --replay cannot be used together.");
      process.exit(1);
    }
    const mode = (abortOpt === "graceful") ? "graceful" as const : "immediate" as const;
    writeAbortRequest(sessionDir, mode);
    console.log(`Abort requested (${mode})`);
    return;
  }

  // --replay mode: send replay request to the running engine
  if (replayOpt) {
    if (value) {
      console.error("Error: --replay cannot be used with a result value.");
      process.exit(1);
    }

    // Validate step exists in workflow
    const workflowPath = path.join(sessionDir, "workflow-v2.yaml");
    if (!fs.existsSync(workflowPath)) {
      console.error("Error: workflow-v2.yaml not found.");
      process.exit(1);
    }

    const workflow = loadV2Workflow(workflowPath);
    const allPaths = collectStepPaths(workflow);
    let targetPath: string | null;
    try {
      targetPath = resolveStepPath(allPaths, replayOpt);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    if (!targetPath) {
      console.error(`Error: Step "${replayOpt}" not found in workflow.`);
      console.error(`Available steps: ${allPaths.join(", ")}`);
      process.exit(1);
    }

    writeReplayRequest(sessionDir, targetPath);
    console.log(`Replay requested: from ${targetPath}`);
    return;
  }

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
