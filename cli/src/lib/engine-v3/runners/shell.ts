import { spawn } from "node:child_process";
import readline from "node:readline";
import type { V2Step } from "../types.js";
import type { EngineLogger } from "../logger.js";
import type { RunnerHandle } from "./types.js";

export interface ShellRunnerOptions {
  step: V2Step;
  stepPath: string;
  sessionDir: string;
  worktreeDir: string;
  env: Record<string, string>;
  logger: EngineLogger;
}

/**
 * Run a shell step by spawning a command as a child process.
 * The command is taken from step.prompt.
 * Returns the exit code.
 */
export function runShellStep(options: ShellRunnerOptions): RunnerHandle {
  const { step, stepPath, worktreeDir, env, logger } = options;

  let childProcess: ReturnType<typeof spawn> | null = null;

  const promise = new Promise<number>((resolve, reject) => {
    const command = step.prompt;
    if (!command) {
      reject(new Error(`Shell step "${stepPath}" has no command (set 'prompt' field)`));
      return;
    }

    logger.info(`  Running: ${command}`);

    const childEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...env,
      FED_STEP: stepPath,
    };

    const child = spawn("sh", ["-c", command], {
      cwd: worktreeDir,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    childProcess = child;

    // Stream stdout lines to logger
    const stdoutRl = readline.createInterface({ input: child.stdout });
    const stderrRl = readline.createInterface({ input: child.stderr });

    stdoutRl.on("line", (line) => {
      logger.info(`    ${line}`);
    });

    stderrRl.on("line", (line) => {
      logger.info(`    ${line}`);
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to spawn shell: ${err.message}`));
    });

    child.on("exit", (code) => {
      // Explicitly close streams to avoid hanging when subprocesses inherit stdio FDs.
      stdoutRl.close();
      stderrRl.close();
      child.stdout.destroy();
      child.stderr.destroy();

      resolve(code ?? 1);
    });
  });

  return {
    promise,
    kill: () => { childProcess?.kill("SIGTERM"); },
  };
}
