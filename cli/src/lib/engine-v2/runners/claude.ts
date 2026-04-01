import { spawn } from "node:child_process";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import type { V2Step } from "../types.js";
import type { EngineLogger } from "../logger.js";

export interface ClaudeRunnerOptions {
  step: V2Step;
  stepPath: string;
  sessionDir: string;
  worktreeDir: string;
  agentInstructionPath: string;
  env: Record<string, string>;
  logger: EngineLogger;
}

// Stream-json event types we care about
interface StreamEvent {
  type: string;
  subtype?: string;
  message?: {
    content?: ContentBlock[];
  };
  result?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

/**
 * Run a claude step by spawning `claude -p` as a child process.
 * Uses stream-json output to show real-time activity in engine logs.
 * Returns the exit code.
 */
export function runClaudeStep(options: ClaudeRunnerOptions): Promise<number> {
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
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--permission-mode", "bypassPermissions",
    ];

    logger.info(`  Running: claude -p (stream-json)`);

    const childEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...env,
      FED_STEP: stepPath,
    };

    const child = spawn("claude", args, {
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

      let event: StreamEvent;
      try {
        event = JSON.parse(line) as StreamEvent;
      } catch {
        return;
      }

      processStreamEvent(event, logger);
    });

    let stderr = "";
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn claude: ${err.message}`));
    });

    child.on("exit", (code) => {
      // Explicitly close streams to avoid hanging when subprocesses inherit stdio FDs.
      // The "close" event waits for all stdio to close, which may never happen
      // if a grandchild process inherited the file descriptors.
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
}

/**
 * Process a stream-json event and log relevant activity.
 */
function processStreamEvent(event: StreamEvent, logger: EngineLogger): void {
  // Assistant message with content blocks
  if (event.type === "assistant" && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === "text" && block.text) {
        // Show first line of assistant text (truncated)
        const firstLine = block.text.split("\n")[0].trim();
        if (firstLine) {
          const truncated = firstLine.length > 120
            ? firstLine.slice(0, 120) + "..."
            : firstLine;
          logger.info(`    💬 ${truncated}`);
        }
      } else if (block.type === "tool_use" && block.name) {
        // Show tool invocation
        const input = block.input;
        let detail = "";
        if (block.name === "Read" && input?.file_path) {
          detail = `: ${input.file_path}`;
        } else if (block.name === "Write" && input?.file_path) {
          detail = `: ${input.file_path}`;
        } else if (block.name === "Edit" && input?.file_path) {
          detail = `: ${input.file_path}`;
        } else if (block.name === "Bash" && input?.command) {
          const cmd = String(input.command);
          detail = `: ${cmd.length > 80 ? cmd.slice(0, 80) + "..." : cmd}`;
        } else if (block.name === "Glob" && input?.pattern) {
          detail = `: ${input.pattern}`;
        } else if (block.name === "Grep" && input?.pattern) {
          detail = `: ${input.pattern}`;
        }
        logger.info(`    🔧 ${block.name}${detail}`);
      }
    }
  }

  // Result event
  if (event.type === "result") {
    if (event.subtype === "error") {
      logger.info(`    ❌ Error in claude session`);
    }
  }
}
