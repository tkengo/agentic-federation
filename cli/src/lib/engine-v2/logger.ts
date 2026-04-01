import fs from "node:fs";
import path from "node:path";
import type { EngineEventEmitter } from "./events.js";

/**
 * Engine logger that writes to both stdout (tmux pane) and a log file.
 * Optionally emits typed events for dashboard consumption.
 */
export class EngineLogger {
  private logStream: fs.WriteStream;
  private emitter: EngineEventEmitter | null;
  private currentStepPath: string | null = null;

  constructor(sessionDir: string, emitter?: EngineEventEmitter) {
    const logPath = path.join(sessionDir, "engine.log");
    this.logStream = fs.createWriteStream(logPath, { flags: "a" });
    this.emitter = emitter ?? null;
  }

  /** Set the active step path for log routing */
  setCurrentStep(stepPath: string | null): void {
    this.currentStepPath = stepPath;
  }

  private formatTimestamp(): string {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, "0");
    const m = String(now.getMinutes()).padStart(2, "0");
    const s = String(now.getSeconds()).padStart(2, "0");
    return `${h}:${m}:${s}`;
  }

  private write(icon: string, message: string): void {
    const line = `[${this.formatTimestamp()}] ${icon} ${message}`;
    // When dashboard is active, suppress stdout (Ink owns the terminal)
    if (!this.emitter) {
      console.log(line);
    }
    this.logStream.write(line + "\n");
  }

  stepStart(stepPath: string, type: string, description?: string): void {
    const desc = description ? ` - ${description}` : "";
    this.write("▶", `Step: ${stepPath} (${type})${desc}`);
    this.currentStepPath = stepPath;
    this.emitter?.emit("step_start", {
      type: "step_start",
      stepPath,
      stepType: type,
      description,
    });
  }

  stepComplete(stepPath: string, result: string | undefined, durationMs: number): void {
    const dur = this.formatDuration(durationMs);
    const res = result ? ` → ${result}` : "";
    this.write("✓", `${stepPath}${res} (${dur})`);
    this.emitter?.emit("step_complete", {
      type: "step_complete",
      stepPath,
      result,
      durationMs,
    });
  }

  stepFailed(stepPath: string, error: string, durationMs: number): void {
    const dur = this.formatDuration(durationMs);
    this.write("✗", `${stepPath} FAILED: ${error} (${dur})`);
    this.emitter?.emit("step_failed", {
      type: "step_failed",
      stepPath,
      error,
      durationMs,
    });
  }

  info(message: string): void {
    this.write(" ", message);
    if (this.emitter && this.currentStepPath) {
      this.emitter.emit("step_log", {
        type: "step_log",
        stepPath: this.currentStepPath,
        message,
      });
    }
  }

  warn(message: string): void {
    this.write("⚠", message);
    if (this.emitter && this.currentStepPath) {
      this.emitter.emit("step_log", {
        type: "step_log",
        stepPath: this.currentStepPath,
        message: `⚠ ${message}`,
      });
    }
  }

  error(message: string): void {
    this.write("✗", message);
    if (this.emitter && this.currentStepPath) {
      this.emitter.emit("step_log", {
        type: "step_log",
        stepPath: this.currentStepPath,
        message: `✗ ${message}`,
      });
    }
  }

  engineStart(workflowName: string, stepCount: number): void {
    this.write("●", `Engine started: ${workflowName} (${stepCount} steps)`);
    this.emitter?.emit("engine_start", {
      type: "engine_start",
      workflowName,
      stepCount,
    });
  }

  engineComplete(durationMs: number): void {
    const dur = this.formatDuration(durationMs);
    this.write("●", `Engine completed (${dur})`);
    this.emitter?.emit("engine_complete", {
      type: "engine_complete",
      durationMs,
    });
  }

  engineFailed(error: string): void {
    this.write("●", `Engine FAILED: ${error}`);
    this.emitter?.emit("engine_failed", {
      type: "engine_failed",
      error,
    });
  }

  engineAborted(mode: string): void {
    this.write("●", `Engine aborted (${mode})`);
    this.emitter?.emit("engine_aborted", {
      type: "engine_aborted",
      mode,
    });
  }

  waiting(message: string): void {
    this.write("◌", `Waiting: ${message}`);
    if (this.emitter && this.currentStepPath) {
      this.emitter.emit("waiting_human", {
        type: "waiting_human",
        stepPath: this.currentStepPath,
        message,
      });
    }
  }

  loopIteration(stepPath: string, iteration: number, max: string): void {
    this.write(" ", `Loop ${stepPath}: iteration ${iteration}/${max}`);
    this.emitter?.emit("loop_iteration", {
      type: "loop_iteration",
      stepPath,
      iteration,
      max,
    });
  }

  close(): void {
    this.logStream.end();
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    if (m < 60) return `${m}m${rs}s`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h${rm}m`;
  }
}
