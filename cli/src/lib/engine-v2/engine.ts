import fs from "node:fs";
import path from "node:path";
import { readMeta } from "../session.js";
import type { MetaJson } from "../types.js";
import { loadV2Workflow } from "./workflow-loader.js";
import {
  initV2State,
  readV2State,
  writeV2State,
  setStepResult,
  clearDescendantResults,
  appendHistory,
  setStatus,
  setCurrentStep,
  getSessionId,
  setSessionId,
} from "./state.js";
import { EngineLogger } from "./logger.js";
import { EngineEventEmitter } from "./events.js";
import { runClaudeStep } from "./runners/claude.js";
import { runHumanStep } from "./runners/human.js";
import { runCodexStep } from "./runners/codex.js";
import { runShellStep } from "./runners/shell.js";
import type { RunnerHandle } from "./runners/types.js";
import { evaluateCondition, type ExprContext } from "./expr.js";
import { readAbortRequest, consumeAbortRequest, clearAbortRequest } from "./abort.js";
import type { V2Step, V2State, V2BranchCase } from "./types.js";

// Sentinel to signal loop break from a branch case
const BREAK_LOOP = Symbol("BREAK_LOOP");

class EngineAbortError extends Error {
  constructor(public readonly mode: "immediate" | "graceful") {
    super(`Engine aborted (${mode})`);
    this.name = "EngineAbortError";
  }
}

/**
 * Main engine entry point.
 * Called from the engine tmux pane with session dir as argument.
 */
export async function runEngine(sessionDir: string, emitter?: EngineEventEmitter): Promise<void> {
  const meta = readMeta(sessionDir);
  if (!meta) {
    console.error("Error: No meta.json found in session directory");
    process.exit(1);
  }

  // Load v2 workflow
  const workflowPath = path.join(sessionDir, "workflow-v2.yaml");
  const workflow = loadV2Workflow(workflowPath);

  const logger = new EngineLogger(sessionDir, emitter);
  logger.engineStart(workflow.name, workflow.steps.length);

  // Initialize or resume state
  let state: V2State;
  const stateFilePath = path.join(sessionDir, "state-v2.json");
  if (fs.existsSync(stateFilePath)) {
    state = readV2State(sessionDir);
    logger.info("Resuming from existing state");
    // Reset status for resume (may have been failed/running from previous crash)
    setStatus(state, "running");
    appendHistory(state, "engine_resume", "", "Resumed from previous state");
    writeV2State(sessionDir, state);
  } else {
    state = initV2State(sessionDir);
  }

  // Clear any stale abort request from a previous run
  clearAbortRequest(sessionDir);

  const engineStartTime = Date.now();

  try {
    await executeBlock(workflow.steps, "", sessionDir, state, meta, logger);

    // All steps completed
    setStatus(state, "completed");
    setCurrentStep(state, null);
    appendHistory(state, "engine_complete", "", "All steps completed");
    writeV2State(sessionDir, state);

    logger.engineComplete(Date.now() - engineStartTime);
  } catch (err) {
    if (err instanceof EngineAbortError) {
      consumeAbortRequest(sessionDir);
      const abortedStep = state.current_step;
      // Clear the aborted step's result so it re-runs on resume
      if (abortedStep && state.results[abortedStep]) {
        delete state.results[abortedStep];
      }
      setStatus(state, "aborted");
      setCurrentStep(state, null);
      appendHistory(state, "engine_aborted", abortedStep ?? "", `mode=${err.mode}`);
      writeV2State(sessionDir, state);

      logger.engineAborted(err.mode);
      return;
    }
    if (err === BREAK_LOOP) {
      // Should not reach here at top level
      logger.error("Unexpected break at top level");
    }
    const message = err instanceof Error ? err.message : String(err);
    setStatus(state, "failed");
    appendHistory(state, "engine_error", state.current_step ?? "", message);
    writeV2State(sessionDir, state);

    logger.engineFailed(message);
    process.exit(1);
  } finally {
    logger.close();
  }
}

/**
 * Wait for a runner to complete, polling for abort requests.
 * For immediate abort: kills the child process and throws EngineAbortError.
 * For graceful abort: lets the step finish, then the caller checks after completion.
 */
async function waitWithAbortCheck(handle: RunnerHandle, sessionDir: string): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    let settled = false;

    const abortChecker = setInterval(() => {
      const req = readAbortRequest(sessionDir);
      if (req && req.mode === "immediate") {
        clearInterval(abortChecker);
        handle.kill();
        settled = true;
        reject(new EngineAbortError("immediate"));
      }
    }, 500);

    handle.promise.then(
      (exitCode) => {
        clearInterval(abortChecker);
        if (!settled) resolve(exitCode);
      },
      (err) => {
        clearInterval(abortChecker);
        if (!settled) reject(err);
      },
    );
  });
}

/**
 * Check for graceful abort request after a step completes.
 * Throws EngineAbortError if a graceful (or immediate) abort was requested.
 */
function checkGracefulAbort(sessionDir: string): void {
  const req = readAbortRequest(sessionDir);
  if (req) {
    throw new EngineAbortError(req.mode);
  }
}

/**
 * Execute a block of steps sequentially.
 * Returns true if a break was signaled (for loop exit).
 */
async function executeBlock(
  steps: V2Step[],
  parentPath: string,
  sessionDir: string,
  state: V2State,
  meta: MetaJson,
  logger: EngineLogger,
): Promise<boolean> {
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepPath = buildStepPath(parentPath, step, i);

    const shouldBreak = await executeStep(step, stepPath, sessionDir, state, meta, logger);
    if (shouldBreak) return true;

    // Check for graceful abort between steps
    checkGracefulAbort(sessionDir);
  }
  return false;
}

function buildStepPath(parentPath: string, step: V2Step, index: number): string {
  const name = step.id ?? `step_${index}`;
  return parentPath ? `${parentPath}.${name}` : name;
}

/**
 * Build expression context from current state.
 */
function buildExprContext(state: V2State, runCtx?: { iteration: number; max: number | null }): ExprContext {
  const steps: Record<string, { result?: string }> = {};
  for (const [key, val] of Object.entries(state.results)) {
    // Use the last segment of the path as the step id for expression resolution
    // e.g., "plan_review_cycle.review" -> accessible as both full path and "review"
    steps[key] = { result: val.value };
    const lastDot = key.lastIndexOf(".");
    if (lastDot >= 0) {
      const shortKey = key.slice(lastDot + 1);
      steps[shortKey] = { result: val.value };
    }
  }
  return {
    steps,
    run: runCtx ? { iteration: runCtx.iteration, max_iterations: runCtx.max } : undefined,
  };
}

/**
 * Check if a step type is an action step (produces a result).
 */
function isActionStep(type: string): boolean {
  return type === "claude" || type === "codex" || type === "shell" || type === "human";
}

/**
 * Execute a single step. Returns true if a loop break was signaled.
 */
async function executeStep(
  step: V2Step,
  stepPath: string,
  sessionDir: string,
  state: V2State,
  meta: MetaJson,
  logger: EngineLogger,
): Promise<boolean> {
  // Skip already-completed action steps (for resume after crash)
  if (isActionStep(step.type) && state.results[stepPath]) {
    logger.info(`Skipping completed step: ${stepPath} (result=${state.results[stepPath].value})`);
    return false;
  }

  switch (step.type) {
    case "loop":
      return await executeLoop(step, stepPath, sessionDir, state, meta, logger);

    case "branch":
      return await executeBranch(step, stepPath, sessionDir, state, meta, logger);

    case "parallel":
      return await executeParallel(step, stepPath, sessionDir, state, meta, logger);

    case "claude":
    case "codex":
    case "shell":
    case "human":
      await executeActionStep(step, stepPath, sessionDir, state, meta, logger);
      return false;

    default:
      throw new Error(`Step type "${step.type}" is not yet implemented`);
  }
}

// ---------------------------------------------------------------------------
// Action steps (claude, human)
// ---------------------------------------------------------------------------

async function executeActionStep(
  step: V2Step,
  stepPath: string,
  sessionDir: string,
  state: V2State,
  meta: MetaJson,
  logger: EngineLogger,
): Promise<void> {
  // Update state
  setCurrentStep(state, stepPath);
  setStatus(state, step.type === "human" ? "waiting_human" : "running");
  appendHistory(state, "step_start", stepPath, `type=${step.type}`);
  writeV2State(sessionDir, state);

  logger.setCurrentStep(stepPath);
  logger.stepStart(stepPath, step.type, step.description);
  const startTime = Date.now();

  let resultValue: string | undefined;

  switch (step.type) {
    case "claude": {
      const worktreeDir = meta.worktree || sessionDir;
      const agentName = step.agent!;
      const agentPath = resolveAgentPath(sessionDir, meta, agentName);

      const env: Record<string, string> = {
        FED_SESSION: meta.tmux_session ?? "",
        FED_SESSION_DIR: sessionDir,
        FED_REPO_DIR: worktreeDir,
      };

      // Determine resume session ID
      const resumeSessionId = step.resume ? getSessionId(state, stepPath) : undefined;

      const handle = runClaudeStep({
        step,
        stepPath,
        sessionDir,
        worktreeDir,
        agentInstructionPath: agentPath,
        env,
        logger,
        resumeSessionId,
      });

      const exitCode = await waitWithAbortCheck(handle, sessionDir);

      // Store session ID for future resume
      if (handle.sessionId) {
        setSessionId(state, stepPath, handle.sessionId);
        writeV2State(sessionDir, state);
      }

      if (exitCode !== 0) {
        // If resume failed (e.g. session expired), retry without resume
        if (resumeSessionId) {
          logger.warn(`  Resume failed (exit ${exitCode}), retrying without resume...`);
          delete state.sessions[stepPath];

          const retryHandle = runClaudeStep({
            step,
            stepPath,
            sessionDir,
            worktreeDir,
            agentInstructionPath: agentPath,
            env,
            logger,
          });

          const retryExitCode = await waitWithAbortCheck(retryHandle, sessionDir);

          if (retryHandle.sessionId) {
            setSessionId(state, stepPath, retryHandle.sessionId);
            writeV2State(sessionDir, state);
          }

          if (retryExitCode !== 0) {
            throw new Error(`claude -p exited with code ${retryExitCode}`);
          }
        } else {
          throw new Error(`claude -p exited with code ${exitCode}`);
        }
      }

      resultValue = readRespondFile(sessionDir, stepPath);
      break;
    }

    case "codex": {
      const worktreeDir = meta.worktree || sessionDir;
      const agentName = step.agent!;
      const agentPath = resolveAgentPath(sessionDir, meta, agentName);

      const env: Record<string, string> = {
        FED_SESSION: meta.tmux_session ?? "",
        FED_SESSION_DIR: sessionDir,
        FED_REPO_DIR: worktreeDir,
      };

      // Determine resume session ID
      const resumeSessionId = step.resume ? getSessionId(state, stepPath) : undefined;

      const handle = runCodexStep({
        step,
        stepPath,
        sessionDir,
        worktreeDir,
        agentInstructionPath: agentPath,
        env,
        logger,
        resumeSessionId,
      });

      const exitCode = await waitWithAbortCheck(handle, sessionDir);

      // Store session ID for future resume
      if (handle.sessionId) {
        setSessionId(state, stepPath, handle.sessionId);
        writeV2State(sessionDir, state);
      }

      if (exitCode !== 0) {
        // If resume failed (e.g. session expired), retry without resume
        if (resumeSessionId) {
          logger.warn(`  Resume failed (exit ${exitCode}), retrying without resume...`);
          delete state.sessions[stepPath];

          const retryHandle = runCodexStep({
            step,
            stepPath,
            sessionDir,
            worktreeDir,
            agentInstructionPath: agentPath,
            env,
            logger,
          });

          const retryExitCode = await waitWithAbortCheck(retryHandle, sessionDir);

          if (retryHandle.sessionId) {
            setSessionId(state, stepPath, retryHandle.sessionId);
            writeV2State(sessionDir, state);
          }

          if (retryExitCode !== 0) {
            throw new Error(`codex exec exited with code ${retryExitCode}`);
          }
        } else {
          throw new Error(`codex exec exited with code ${exitCode}`);
        }
      }

      resultValue = readRespondFile(sessionDir, stepPath);
      break;
    }

    case "shell": {
      const worktreeDir = meta.worktree || sessionDir;
      const env: Record<string, string> = {
        FED_SESSION: meta.tmux_session ?? "",
        FED_SESSION_DIR: sessionDir,
        FED_REPO_DIR: worktreeDir,
      };

      const handle = runShellStep({
        step,
        stepPath,
        sessionDir,
        worktreeDir,
        env,
        logger,
      });

      const exitCode = await waitWithAbortCheck(handle, sessionDir);

      // Shell step result is based on exit code
      resultValue = exitCode === 0 ? "pass" : "fail";
      if (exitCode !== 0) {
        logger.warn(`  Shell exited with code ${exitCode}`);
      }
      break;
    }

    case "human": {
      const handle = runHumanStep({
        step,
        stepPath,
        sessionDir,
        logger,
      });

      // Wrap string promise into RunnerHandle for abort checking
      let humanResult: string | undefined;
      await waitWithAbortCheck(
        {
          promise: handle.promise.then((v) => { humanResult = v; return 0; }),
          kill: handle.kill,
        },
        sessionDir,
      );
      resultValue = humanResult;
      break;
    }
  }

  // Record result
  const durationMs = Date.now() - startTime;

  if (resultValue) {
    if (step.result?.values && !step.result.values.includes(resultValue)) {
      logger.warn(
        `Invalid result "${resultValue}" for step ${stepPath}. Valid: ${step.result.values.join(", ")}`
      );
    }
    setStepResult(state, stepPath, resultValue);
  }

  setCurrentStep(state, null);
  setStatus(state, "running");
  appendHistory(state, "step_complete", stepPath, `result=${resultValue ?? "(none)"} duration=${durationMs}ms`);
  writeV2State(sessionDir, state);

  logger.stepComplete(stepPath, resultValue, durationMs);
  logger.setCurrentStep(null);
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

async function executeLoop(
  step: V2Step,
  stepPath: string,
  sessionDir: string,
  state: V2State,
  meta: MetaJson,
  logger: EngineLogger,
): Promise<boolean> {
  if (!step.steps || step.steps.length === 0) {
    throw new Error(`Loop step "${stepPath}" has no sub-steps`);
  }

  // Skip if loop was already completed in a previous run
  const loopCompleted = state.history.some(
    h => h.event === "loop_complete" && h.step === stepPath
  );
  if (loopCompleted) {
    logger.info(`Skipping completed loop: ${stepPath}`);
    return false;
  }

  // If max is not set but until is present, loop indefinitely (until condition satisfied)
  // If neither is set, safety limit of 100
  const maxIterations = step.max ?? (step.until ? Infinity : 100);

  logger.stepStart(stepPath, "loop", step.description);
  const maxLabel = maxIterations === Infinity ? "∞" : String(maxIterations);
  appendHistory(state, "loop_start", stepPath, `max=${maxLabel}`);
  const startTime = Date.now();

  // Track loop exit reason
  let exitReason: "until_satisfied" | "break" | "max_reached" = "max_reached";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    logger.loopIteration(stepPath, iteration, maxLabel);

    // Clear descendant results from previous iteration to allow re-execution
    if (iteration > 1) {
      const cleared = clearDescendantResults(state, stepPath);
      if (cleared.length > 0) {
        logger.info(`  Loop ${stepPath}: cleared ${cleared.length} descendant result(s) for re-execution`);
        writeV2State(sessionDir, state);
      }
    }

    // Check 'until' condition BEFORE executing steps (except first iteration)
    if (iteration > 1 && step.until) {
      const ctx = buildExprContext(state, { iteration, max: maxIterations });
      if (evaluateCondition(step.until, ctx)) {
        logger.info(`  Loop ${stepPath}: until condition satisfied`);
        exitReason = "until_satisfied";
        break;
      }
    }

    // Execute sub-steps
    const didBreak = await executeBlock(step.steps, stepPath, sessionDir, state, meta, logger);
    if (didBreak) {
      logger.info(`  Loop ${stepPath}: break signaled`);
      exitReason = "break";
      break;
    }

    // Check 'until' condition AFTER executing steps
    if (step.until) {
      const ctx = buildExprContext(state, { iteration, max: maxIterations });
      if (evaluateCondition(step.until, ctx)) {
        logger.info(`  Loop ${stepPath}: until condition satisfied`);
        exitReason = "until_satisfied";
        break;
      }
    }
  }

  // Escalate to human when max reached with unsatisfied until condition.
  // If there's no until condition, max_reached is the expected/normal termination.
  if (exitReason === "max_reached" && step.until) {
    logger.info(`  Loop ${stepPath}: max iterations reached without satisfying until condition — escalating to human`);
    appendHistory(state, "loop_max_reached", stepPath, `max=${maxLabel} until=${step.until}`);
    writeV2State(sessionDir, state);

    const escalationStepPath = `${stepPath}.__max_escalation`;
    const prompt = `ループ "${stepPath}" が最大回数 (${maxLabel}) に到達しましたが、終了条件 (${step.until}) が満たされていません。状況を確認して対応してください。`;

    setCurrentStep(state, escalationStepPath);
    setStatus(state, "waiting_human");
    appendHistory(state, "step_start", escalationStepPath, "type=human (max_reached escalation)");
    writeV2State(sessionDir, state);

    const handle = runHumanStep({
      step: { id: "__max_escalation", type: "human", prompt, notify: true } as V2Step,
      stepPath: escalationStepPath,
      sessionDir,
      logger,
    });

    let humanResult: string | undefined;
    await waitWithAbortCheck(
      {
        promise: handle.promise.then((v) => { humanResult = v; return 0; }),
        kill: handle.kill,
      },
      sessionDir,
    );

    setStepResult(state, escalationStepPath, humanResult ?? "acknowledged");
    setStatus(state, "running");
    appendHistory(state, "step_complete", escalationStepPath, `result=${humanResult ?? "acknowledged"}`);
    writeV2State(sessionDir, state);
  }

  const durationMs = Date.now() - startTime;
  appendHistory(state, "loop_complete", stepPath, `reason=${exitReason} duration=${durationMs}ms`);
  writeV2State(sessionDir, state);

  logger.stepComplete(stepPath, undefined, durationMs);
  return false;
}

// ---------------------------------------------------------------------------
// Branch
// ---------------------------------------------------------------------------

async function executeBranch(
  step: V2Step,
  stepPath: string,
  sessionDir: string,
  state: V2State,
  meta: MetaJson,
  logger: EngineLogger,
): Promise<boolean> {
  if (!step.cases || step.cases.length === 0) {
    throw new Error(`Branch step "${stepPath}" has no cases`);
  }

  logger.stepStart(stepPath, "branch", step.description);
  const ctx = buildExprContext(state);

  for (let i = 0; i < step.cases.length; i++) {
    const branchCase = step.cases[i];

    // Evaluate condition (else case always matches)
    const isElse = branchCase.else === true || (!branchCase.if && branchCase.if !== "");
    const conditionMet = isElse || (branchCase.if ? evaluateCondition(branchCase.if, ctx) : false);

    if (conditionMet) {
      const caseLabel = isElse ? "else" : `case[${i}]`;
      logger.info(`  Branch ${stepPath}: matched ${caseLabel}`);

      // Check for break signal on the case itself
      if (branchCase.break) {
        logger.info(`  Branch ${stepPath}: break signaled`);
        return true;
      }

      // Execute the case's steps
      if (branchCase.steps && branchCase.steps.length > 0) {
        const didBreak = await executeBlock(branchCase.steps, stepPath, sessionDir, state, meta, logger);
        if (didBreak) return true;
      }

      return false; // First matching case wins
    }
  }

  logger.info(`  Branch ${stepPath}: no case matched`);
  return false;
}

// ---------------------------------------------------------------------------
// Parallel
// ---------------------------------------------------------------------------

async function executeParallel(
  step: V2Step,
  stepPath: string,
  sessionDir: string,
  state: V2State,
  meta: MetaJson,
  logger: EngineLogger,
): Promise<boolean> {
  if (!step.branches || step.branches.length === 0) {
    throw new Error(`Parallel step "${stepPath}" has no branches`);
  }

  // Skip if parallel was already completed in a previous run
  const parallelCompleted = state.history.some(
    h => h.event === "parallel_complete" && h.step === stepPath
  );
  if (parallelCompleted) {
    logger.info(`Skipping completed parallel: ${stepPath}`);
    return false;
  }

  logger.stepStart(stepPath, "parallel", step.description);
  logger.info(`  ${step.branches.length} branches`);
  appendHistory(state, "parallel_start", stepPath, `branches=${step.branches.length}`);
  writeV2State(sessionDir, state);

  const startTime = Date.now();

  // Create abort controller for canceling sibling branches on failure
  const abortController = new AbortController();

  // Launch all branches concurrently
  const promises = step.branches.map(async (branch) => {
    const branchPath = `${stepPath}.${branch.id}`;

    // Convert parallel branch to a V2Step for executeActionStep
    const branchStep: V2Step = {
      id: branch.id,
      type: branch.type,
      agent: branch.agent,
      description: branch.description,
      prompt: branch.prompt,
      result: branch.result,
      resume: branch.resume,
      resume_prompt: branch.resume_prompt,
    };

    try {
      // Check abort before starting
      if (abortController.signal.aborted) return;

      await executeActionStep(branchStep, branchPath, sessionDir, state, meta, logger);
    } catch (err) {
      // Abort all sibling branches
      abortController.abort();
      throw err;
    }
  });

  try {
    await Promise.all(promises);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`  Parallel ${stepPath}: branch failed: ${message}`);
    throw err;
  }

  const durationMs = Date.now() - startTime;
  appendHistory(state, "parallel_complete", stepPath, `duration=${durationMs}ms`);
  writeV2State(sessionDir, state);

  logger.stepComplete(stepPath, undefined, durationMs);
  return false;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function resolveAgentPath(sessionDir: string, meta: MetaJson, agentName: string): string {
  const agentsDir = path.join(sessionDir, "agents");

  const directPath = path.join(agentsDir, `${agentName}.md`);
  if (fs.existsSync(directPath)) return directPath;

  const composedName = `__fed-${meta.workflow}-${meta.tmux_session}-${agentName}`;
  const composedPath = path.join(agentsDir, `${composedName}.md`);
  if (fs.existsSync(composedPath)) return composedPath;

  if (fs.existsSync(agentsDir)) {
    const files = fs.readdirSync(agentsDir);
    const match = files.find((f) => f.endsWith(`-${agentName}.md`));
    if (match) return path.join(agentsDir, match);
  }

  return directPath;
}

function readRespondFile(sessionDir: string, stepPath: string): string | undefined {
  const safeStepPath = stepPath.replace(/[./]/g, "_");
  const respondFile = path.join(sessionDir, "respond", `${safeStepPath}.respond`);

  if (fs.existsSync(respondFile)) {
    const value = fs.readFileSync(respondFile, "utf-8").trim();
    return value || undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// CLI entry point (called from tmux pane)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const sessionDir = process.argv[2];
  if (!sessionDir) {
    console.error("Usage: engine.ts <session-dir> [--no-dashboard]");
    process.exit(1);
  }

  const noDashboard = process.argv.includes("--no-dashboard");

  if (noDashboard) {
    // Run engine without dashboard (original console.log mode)
    await runEngine(sessionDir);
    return;
  }

  // Run engine with Ink dashboard
  const { EngineEventEmitter } = await import("./events.js");
  const { render } = await import("ink");
  const React = await import("react");
  const { EngineApp } = await import("./dashboard/EngineApp.js");
  const { buildStepTree } = await import("./dashboard/build-step-tree.js");
  const { loadV2Workflow } = await import("./workflow-loader.js");
  const { patchStdoutBuffering } = await import("./dashboard/buffered-stdout.js");

  const emitter = new EngineEventEmitter();

  const workflowPath = path.join(sessionDir, "workflow-v2.yaml");
  const workflow = loadV2Workflow(workflowPath);
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
      sessionDir,
    }),
    { patchConsole: false },
  );

  try {
    await runEngine(sessionDir, emitter);
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

main().catch((err) => {
  console.error("Engine fatal error:", err);
  process.exit(1);
});
