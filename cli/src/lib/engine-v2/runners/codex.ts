import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import type { V2Step } from "../types.js";
import type { EngineLogger } from "../logger.js";

export interface CodexRunnerOptions {
  step: V2Step;
  stepPath: string;
  sessionDir: string;
  worktreeDir: string;
  agentInstructionPath: string;
  env: Record<string, string>;
  logger: EngineLogger;
}

// Codex JSONL event types
interface CodexEvent {
  type: string;
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
export function runCodexStep(options: CodexRunnerOptions): Promise<number> {
  const { step, stepPath, sessionDir, worktreeDir, agentInstructionPath, env, logger } = options;

  return new Promise((resolve, reject) => {
    if (!fs.existsSync(agentInstructionPath)) {
      reject(new Error(`Agent instruction not found: ${agentInstructionPath}`));
      return;
    }
    const agentInstruction = fs.readFileSync(agentInstructionPath, "utf-8");

    let prompt = agentInstruction;
    if (step.prompt) {
      prompt += "\n\n---\n\n" + step.prompt;
    }

    const args = [
      "exec",
      "--json",
      "--dangerously-bypass-approvals-and-sandbox",
      "-C", worktreeDir,
      "-",
    ];

    logger.info(`  Running: codex exec (json)`);

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

      processCodexEvent(event, logger);
    });

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn codex: ${err.message}`));
    });

    child.on("close", (code) => {
      const exitCode = code ?? 1;

      if (stderr.trim()) {
        const lines = stderr.trim().split("\n");
        const tail = lines.slice(-3).join("\n");
        logger.info(`  stderr: ${tail}`);
      }

      resolve(exitCode);
    });
  });
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
