import fs from "node:fs";
import path from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { WorkflowStep } from "../types.js";
import type { EngineLogger } from "../logger.js";
import type { RunnerHandle } from "./types.js";
import { resolveAgentPane } from "../agent-pane.js";
import { loadV2Workflow } from "../workflow-loader.js";
import { findWorkflowYaml } from "../../workflow-yaml.js";
import * as tmux from "../../tmux.js";

export interface ClaudeRunnerOptions {
  step: WorkflowStep;
  stepPath: string;
  sessionDir: string;
  worktreeDir: string;
  agentInstructionPath: string;
  env: Record<string, string>;
  logger: EngineLogger;
  resumeSessionId?: string;
}

/**
 * Run a claude step (engine-v3 mode).
 *
 * Instead of spawning a headless `claude -p` process, this dispatches the
 * task to a long-running `yoloclaude` process that already lives in the
 * agent's tmux pane. Completion is detected by watching for the agent's
 * respond file (written when the agent runs `fed session respond-workflow`).
 *
 * Returns 0 on success, rejects on dispatch / watcher failure.
 */
export function runClaudeStep(options: ClaudeRunnerOptions): RunnerHandle {
  const { step, stepPath, sessionDir, agentInstructionPath, env, logger, resumeSessionId } = options;

  let watcher: FSWatcher | null = null;
  let killed = false;

  const handle: RunnerHandle = {
    promise: null as unknown as Promise<number>,
    kill: () => {
      killed = true;
      watcher?.close().catch(() => {});
    },
  };

  handle.promise = new Promise<number>((resolve, reject) => {
    if (!fs.existsSync(agentInstructionPath)) {
      reject(new Error(`Agent instruction not found: ${agentInstructionPath}`));
      return;
    }

    // Resolve the agent's pane target from the workflow definition.
    const tmuxSession = env.FED_SESSION;
    if (!tmuxSession) {
      reject(new Error("FED_SESSION not set in runner env"));
      return;
    }
    const wfPath = findWorkflowYaml(sessionDir);
    if (!wfPath) {
      reject(new Error("workflow YAML not found in session directory"));
      return;
    }
    const workflow = loadV2Workflow(wfPath);
    const agentId = step.agent!;
    let paneTarget: string;
    try {
      paneTarget = resolveAgentPane(workflow, tmuxSession, agentId);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    // Build the message to dispatch to the resident claude.
    // Agent instruction is read by the agent itself via `fed prompt read`
    // (avoids stuffing large instructions through tmux send-keys, and lets
    // the agent re-read updated instructions during long-lived sessions).
    const agentShortName = path.basename(agentInstructionPath, ".md");
    let message: string;
    if (resumeSessionId) {
      message = step.resume_prompt
        ?? "前回の続きから作業を再開してください。最新のアーティファクトを読み直してから対応してください。";
      logger.info(`  → ${paneTarget} (resume)`);
    } else {
      const lines = [
        `\`fed prompt read ${agentShortName}\` を実行し、その指示に従って作業を開始してください。`,
      ];
      if (step.prompt) {
        lines.push("");
        lines.push("追加指示:");
        lines.push(step.prompt);
      }
      message = lines.join("\n");
      logger.info(`  → ${paneTarget}`);
    }

    // Set up the respond watcher BEFORE dispatching to avoid a race where
    // the agent writes the respond file before chokidar attaches.
    const respondDir = path.join(sessionDir, "respond");
    fs.mkdirSync(respondDir, { recursive: true });
    const safeStepPath = stepPath.replace(/[./]/g, "_");
    const respondFile = path.join(respondDir, `${safeStepPath}.respond`);

    if (fs.existsSync(respondFile)) {
      fs.unlinkSync(respondFile);
    }

    watcher = watch(respondDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });

    watcher.on("add", (filePath: string) => {
      if (path.basename(filePath) === `${safeStepPath}.respond`) {
        watcher?.close().catch(() => {});
        // Sentinel sessionId so a future step.resume can detect a prior run.
        // The pane identity is stable, so any non-empty string works.
        handle.sessionId = paneTarget;
        resolve(0);
      }
    });

    watcher.on("error", (err) => {
      watcher?.close().catch(() => {});
      reject(new Error(`Watcher error: ${err}`));
    });

    if (killed) {
      watcher?.close().catch(() => {});
      reject(new Error("Step killed before dispatch"));
      return;
    }

    // Dispatch via tmux send-keys. Use sendPrompt (text -> sleep -> Enter)
    // so the resident CLI doesn't treat the trailing Enter as part of the
    // pasted text.
    try {
      tmux.sendPrompt(paneTarget, message);
    } catch (err) {
      watcher?.close().catch(() => {});
      reject(new Error(
        `Failed to send-keys to ${paneTarget}: ${err instanceof Error ? err.message : String(err)}`
      ));
    }
  });

  return handle;
}
