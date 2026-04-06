import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import type { V2Step } from "../types.js";
import type { EngineLogger } from "../logger.js";
import type { RunnerHandle } from "./types.js";

export interface CodexRunnerOptions {
  step: V2Step;
  stepPath: string;
  sessionDir: string;
  worktreeDir: string;
  agentInstructionPath: string;
  env: Record<string, string>;
  logger: EngineLogger;
  resumeSessionId?: string;
}

// Codex JSONL event types
interface CodexEvent {
  type: string;
  thread_id?: string;
  item?: {
    id?: string;
    type?: string;
    text?: string;
    command?: string;
    exit_code?: number | null;
    status?: string;
  };
}

/**
 * Run a codex step by spawning `codex exec` as a child process.
 * Uses --json output to show real-time activity in engine logs.
 * Returns the exit code.
 */
export function runCodexStep(options: CodexRunnerOptions): RunnerHandle {
  const { step, stepPath, sessionDir, worktreeDir, agentInstructionPath, env, logger, resumeSessionId } = options;

  let childProcess: ReturnType<typeof spawn> | null = null;
  const handle: RunnerHandle = {
    promise: null as unknown as Promise<number>,
    kill: () => { childProcess?.kill("SIGTERM"); },
  };

  handle.promise = new Promise<number>((resolve, reject) => {
    if (!fs.existsSync(agentInstructionPath)) {
      reject(new Error(`Agent instruction not found: ${agentInstructionPath}`));
      return;
    }
    const agentInstruction = fs.readFileSync(agentInstructionPath, "utf-8");

    let prompt: string;
    let args: string[];

    if (resumeSessionId) {
      // Resume mode
      args = [
        "exec", "resume",
        resumeSessionId,
        "-",  // Read prompt from stdin
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "-c", "shell_environment_policy.inherit='all'",
      ];
      prompt = step.resume_prompt
        ?? "Continue from where you left off. Re-read artifacts for updated context.";
      logger.info(`  Running: codex exec resume ${resumeSessionId.slice(0, 8)}...`);
    } else {
      // Normal mode
      args = [
        "exec",
        "--json",
        "--dangerously-bypass-approvals-and-sandbox",
        "-c", "shell_environment_policy.inherit='all'",
        "-C", worktreeDir,
        "-",
      ];
      prompt = agentInstruction;
      if (step.prompt) {
        prompt += "\n\n---\n\n" + step.prompt;
      }
      logger.info(`  Running: codex exec (json)`);
    }

    const childEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...env,
      FED_STEP: stepPath,
    };

    const child = spawn("codex", args, {
      cwd: worktreeDir,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    childProcess = child;

    child.stdin.write(prompt);
    child.stdin.end();

    // Parse JSONL stream from stdout
    const rl = readline.createInterface({ input: child.stdout });

    rl.on("line", (line) => {
      if (!line.trim()) return;

      let event: CodexEvent;
      try {
        event = JSON.parse(line) as CodexEvent;
      } catch {
        return;
      }

      // Capture thread_id from thread.started event
      if (event.type === "thread.started" && event.thread_id) {
        handle.sessionId = event.thread_id;
      }

      processCodexEvent(event, logger);
    });

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn codex: ${err.message}`));
    });

    child.on("exit", (code) => {
      // Explicitly close streams to avoid hanging when subprocesses inherit stdio FDs.
      rl.close();
      child.stdout.destroy();
      child.stderr.destroy();

      const exitCode = code ?? 1;

      if (stderr.trim()) {
        const lines = stderr.trim().split("\n");
        const tail = lines.slice(-3).join("\n");
        logger.info(`  stderr: ${tail}`);
      }

      resolve(exitCode);
    });
  });

  return handle;
}

/**
 * Process a codex JSONL event and log relevant activity.
 */
function processCodexEvent(event: CodexEvent, logger: EngineLogger): void {
  const item = event.item;
  if (!item) return;

  // Agent message (assistant text)
  if (event.type === "item.completed" && item.type === "agent_message" && item.text) {
    const firstLine = item.text.split("\n")[0].trim();
    if (firstLine) {
      const truncated = firstLine.length > 120
        ? firstLine.slice(0, 120) + "..."
        : firstLine;
      logger.info(`    💬 ${truncated}`);
    }
  }

  // Command execution started
  if (event.type === "item.started" && item.type === "command_execution" && item.command) {
    const cmd = item.command;
    const truncated = cmd.length > 100
      ? cmd.slice(0, 100) + "..."
      : cmd;
    logger.info(`    🔧 exec: ${truncated}`);
  }

  // Command execution completed (show exit code if non-zero)
  if (event.type === "item.completed" && item.type === "command_execution") {
    if (item.exit_code !== null && item.exit_code !== undefined && item.exit_code !== 0) {
      logger.info(`    ⚠ exit code: ${item.exit_code}`);
    }
  }
}
