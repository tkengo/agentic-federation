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

export interface CodexRunnerOptions {
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
 * Run a codex step (engine-v3 mode).
 *
 * Dispatches the task to a long-running `yolocodex` process living in the
 * agent's tmux pane. Completion is detected via the agent's respond file.
 *
 * Returns 0 on success, rejects on dispatch / watcher failure.
 */
export function runCodexStep(options: CodexRunnerOptions): RunnerHandle {
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

    const agentShortName = path.basename(agentInstructionPath, ".md");
    let message: string;
    if (resumeSessionId) {
      message = step.resume_prompt
        ?? "前回の続きから作業を再開してください。最新のアーティファクトを読み直してから対応してください。";
      logger.info(`  → ${paneTarget} (codex, resume)`);
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
      logger.info(`  → ${paneTarget} (codex)`);
    }

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

    // Use sendPrompt (text -> sleep -> Enter) so codex doesn't swallow the
    // trailing Enter as part of the pasted text.
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
