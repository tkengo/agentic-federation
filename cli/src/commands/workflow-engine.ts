import fs from "node:fs";
import path from "node:path";
import { resolveSession, requireSessionDir } from "../lib/session.js";
import { initV2State } from "../lib/engine-v2/state.js";
import { runEngine } from "../lib/engine-v2/engine.js";
import { loadV2Workflow } from "../lib/engine-v2/workflow-loader.js";

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

  const app = render(
    React.createElement(EngineApp, {
      emitter,
      initialSteps,
      workflowName: workflow.name,
      sessionDir: sessionPath,
    }),
    { patchConsole: false },
  );

  try {
    await runEngine(sessionPath, emitter);
  } catch {
    // Engine handles its own error logging
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
