import fs from "node:fs";
import path from "node:path";
import { resolveSession, requireSessionDir } from "../lib/session.js";
import { initV2State, readV2State, writeV2State, appendHistory } from "../lib/engine-v2/state.js";
import { runEngine } from "../lib/engine-v2/engine.js";
import { loadV2Workflow, collectStepPaths, resolveStepPath } from "../lib/engine-v2/workflow-loader.js";

/**
 * `fed session start-engine [session-name]`
 *
 * Start the v2 engine directly in the current terminal.
 * By default, resumes from last completed step (skips completed steps).
 * With --reset, reinitializes state and starts from the beginning.
 * With --from <step>, clears results from that step onwards and resumes.
 */
export async function workflowEngineCommand(
  sessionName?: string,
  reset?: boolean,
  from?: string,
): Promise<void> {
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

  // --reset and --from are mutually exclusive
  if (reset && from) {
    console.error("Error: --reset and --from cannot be used together.");
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

  // Replay from a specific step
  if (from) {
    const workflow = loadV2Workflow(workflowYamlPath);
    const allPaths = collectStepPaths(workflow);
    let targetPath: string | null;
    try {
      targetPath = resolveStepPath(allPaths, from);
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    if (!targetPath) {
      console.error(`Error: Step "${from}" not found in workflow.`);
      console.error(`Available steps: ${allPaths.join(", ")}`);
      process.exit(1);
    }

    const stateFilePath = path.join(sessionPath, "state-v2.json");
    if (!fs.existsSync(stateFilePath)) {
      console.error("Error: No state-v2.json found. Engine has not been run yet.");
      process.exit(1);
    }

    const state = readV2State(sessionPath);
    const targetIndex = allPaths.indexOf(targetPath);
    const pathsToClear = allPaths.slice(targetIndex);

    let cleared = 0;
    for (const p of pathsToClear) {
      if (state.results[p]) { delete state.results[p]; cleared++; }
      if (state.sessions[p]) { delete state.sessions[p]; }
      if (state.loops[p]) { delete state.loops[p]; }
    }

    // Also clear container completion markers from history
    state.history = state.history.filter(
      h => !(
        (h.event === "parallel_complete" || h.event === "loop_complete") &&
        pathsToClear.includes(h.step)
      )
    );

    // Clear respond files for affected steps
    const respondDir = path.join(sessionPath, "respond");
    if (fs.existsSync(respondDir)) {
      for (const p of pathsToClear) {
        const safeStepPath = p.replace(/[./]/g, "_");
        const respondFile = path.join(respondDir, `${safeStepPath}.respond`);
        if (fs.existsSync(respondFile)) { fs.unlinkSync(respondFile); }
      }
    }

    state.status = "running";
    state.current_step = null;
    state.replay_from = targetPath;
    appendHistory(state, "replay_from", targetPath, `cleared=${cleared} steps`);
    writeV2State(sessionPath, state);

    console.log(`Replaying from step: ${targetPath} (cleared ${cleared} result(s))`);
  }

  const modeLabel = reset
    ? "Starting engine from beginning..."
    : from
      ? `Starting engine (replaying from ${from})...`
      : "Starting engine (resuming from last completed step)..."
  console.log(modeLabel);

  // Launch engine with Ink dashboard
  const { EngineEventEmitter } = await import("../lib/engine-v2/events.js");
  const { render } = await import("ink");
  const React = await import("react");
  const { EngineApp } = await import("../lib/engine-v2/dashboard/EngineApp.js");
  const { buildStepTree } = await import("../lib/engine-v2/dashboard/build-step-tree.js");
  const { patchStdoutBuffering } = await import("../lib/engine-v2/dashboard/buffered-stdout.js");

  const emitter = new EngineEventEmitter();

  const workflow = loadV2Workflow(workflowYamlPath);
  const initialSteps = buildStepTree(workflow);

  // Clear screen before starting dashboard
  process.stdout.write("\x1b[2J\x1b[H");

  // Patch stdout.write to batch Ink's erase+content writes into a single
  // atomic write — eliminates the erase→write gap that causes flicker.
  const restoreStdout = patchStdoutBuffering();

  // Suppress all console output during dashboard mode.
  // Libraries (chokidar, etc.) may call console.log/error, which triggers
  // Ink's patchConsole re-layout and causes flicker.
  const savedConsole = { log: console.log, error: console.error, warn: console.warn };
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};

  let app: ReturnType<typeof render>;
  try {
    app = render(
      React.createElement(EngineApp, {
        emitter,
        initialSteps,
        workflowName: workflow.name,
        sessionDir: sessionPath,
      }),
      { patchConsole: false },
    );
  } catch (err) {
    restoreStdout();
    Object.assign(console, savedConsole);
    console.error("Failed to render engine dashboard:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  try {
    await runEngine(sessionPath, emitter);
  } catch (err) {
    restoreStdout();
    Object.assign(console, savedConsole);
    app.unmount();
    console.error("Engine crashed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Keep the dashboard alive so user can see final state.
  // Wait for user to press q or ctrl+c.
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.on("data", (data: Buffer) => {
    const key = data.toString();
    if (key === "q" || key === "\x03") {
      app.unmount();
      restoreStdout();
      Object.assign(console, savedConsole);
      process.exit(0);
    }
  });
}
