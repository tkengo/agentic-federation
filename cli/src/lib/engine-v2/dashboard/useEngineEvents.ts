import { useState, useEffect, useRef, useCallback } from "react";
import type { EngineEventEmitter } from "../events.js";
import type { StepNode, StepStatus } from "./types.js";

const MAX_LOG_LINES = 500;

export interface LogEntry {
  timestamp: Date;
  message: string;
}

export interface EngineState {
  steps: StepNode[];
  logs: Map<string, LogEntry[]>;
  selectedIndex: number;
  autoFollow: boolean;
  engineStatus: "running" | "completed" | "failed" | "aborted";
  engineDurationMs?: number;
  hasRunningStep: boolean;
}

/**
 * All mutable state lives in refs. A single tick (driven by the spinner timer
 * in EngineApp) calls `flush()` to copy refs into React state, producing
 * exactly one re-render per tick — but only when something actually changed.
 */
export function useEngineEvents(
  emitter: EngineEventEmitter,
  initialSteps: StepNode[],
): EngineState & {
  moveSelection: (delta: number) => void;
  flush: () => boolean; // returns true if state was dirty
} {
  // --- Refs: mutable, updated synchronously by event handlers ---
  const stepsRef = useRef<StepNode[]>(initialSteps);
  const logsRef = useRef<Map<string, LogEntry[]>>(new Map());
  const selectedIndexRef = useRef(0);
  const autoFollowRef = useRef(true);
  const engineStatusRef = useRef<"running" | "completed" | "failed" | "aborted">("running");
  const engineDurationRef = useRef<number | undefined>();
  const manualNavTime = useRef(0);
  const dirtyRef = useRef(false);

  // --- React state: only updated via flush() ---
  const [steps, setSteps] = useState<StepNode[]>(initialSteps);
  const [logs, setLogs] = useState<Map<string, LogEntry[]>>(new Map());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [autoFollow, setAutoFollow] = useState(true);
  const [engineStatus, setEngineStatus] = useState<"running" | "completed" | "failed" | "aborted">("running");
  const [engineDurationMs, setEngineDurationMs] = useState<number | undefined>();
  const [hasRunningStep, setHasRunningStep] = useState(false);

  // --- flush: copy refs → state, but only if dirty ---
  const flush = useCallback((): boolean => {
    if (!dirtyRef.current) return false;
    dirtyRef.current = false;

    const currentSteps = stepsRef.current;
    setSteps([...currentSteps]);
    setLogs(new Map(logsRef.current));
    setSelectedIndex(selectedIndexRef.current);
    setAutoFollow(autoFollowRef.current);
    setEngineStatus(engineStatusRef.current);
    setEngineDurationMs(engineDurationRef.current);
    setHasRunningStep(currentSteps.some((s) => s.status === "running"));
    return true;
  }, []);

  const markDirty = (): void => {
    dirtyRef.current = true;
  };

  // --- Ref mutators (no re-render) ---

  const updateStepRef = (stepPath: string, updates: Partial<StepNode>): void => {
    stepsRef.current = stepsRef.current.map((s) =>
      s.stepPath === stepPath ? { ...s, ...updates } : s,
    );
    markDirty();
  };

  const setParentRunning = (stepPath: string): void => {
    const parts = stepPath.split(".");
    for (let i = parts.length - 1; i >= 1; i--) {
      const parentPath = parts.slice(0, i).join(".");
      stepsRef.current = stepsRef.current.map((s) => {
        if (s.stepPath === parentPath && s.status === "not_started") {
          return { ...s, status: "running" as StepStatus };
        }
        return s;
      });
    }
  };

  const appendLog = (stepPath: string, message: string): void => {
    const existing = logsRef.current.get(stepPath) ?? [];
    const updated = [...existing, { timestamp: new Date(), message }];
    if (updated.length > MAX_LOG_LINES) {
      updated.splice(0, updated.length - MAX_LOG_LINES);
    }
    logsRef.current.set(stepPath, updated);
    markDirty();
  };

  const findStepIndex = (stepPath: string): number => {
    return stepsRef.current.findIndex((s) => s.stepPath === stepPath);
  };

  // --- Keyboard navigation (flushes immediately for responsiveness) ---
  const moveSelection = useCallback((delta: number): void => {
    autoFollowRef.current = false;
    manualNavTime.current = Date.now();

    const next = selectedIndexRef.current + delta;
    const max = stepsRef.current.length - 1;
    selectedIndexRef.current = Math.max(0, Math.min(max, next));

    // Immediate flush so key presses feel instant
    setSelectedIndex(selectedIndexRef.current);
    setAutoFollow(false);

    // Re-enable auto-follow after 10 seconds of no manual nav
    setTimeout(() => {
      if (Date.now() - manualNavTime.current >= 9500) {
        autoFollowRef.current = true;
      }
    }, 10000);
  }, []);

  // --- Subscribe to engine events ---
  useEffect(() => {
    const onStepStart = (e: { stepPath: string; stepType: string; description?: string }) => {
      updateStepRef(e.stepPath, { status: "running" });
      setParentRunning(e.stepPath);
      appendLog(e.stepPath, `▶ Starting (${e.stepType})${e.description ? ` - ${e.description}` : ""}`);
    };

    const onStepComplete = (e: { stepPath: string; result?: string; durationMs: number }) => {
      updateStepRef(e.stepPath, {
        status: "completed",
        result: e.result,
        durationMs: e.durationMs,
      });
      const dur = formatDuration(e.durationMs);
      appendLog(e.stepPath, `✓ Completed${e.result ? ` → ${e.result}` : ""} (${dur})`);
    };

    const onStepFailed = (e: { stepPath: string; error: string; durationMs: number }) => {
      updateStepRef(e.stepPath, {
        status: "failed",
        durationMs: e.durationMs,
      });
      appendLog(e.stepPath, `✗ Failed: ${e.error}`);
    };

    const onStepLog = (e: { stepPath: string; message: string }) => {
      appendLog(e.stepPath, e.message);
    };

    const onLoopIteration = (e: { stepPath: string; iteration: number; max: string }) => {
      updateStepRef(e.stepPath, {
        iterationLabel: `${e.iteration}/${e.max}`,
      });
    };

    const onWaitingHuman = (e: { stepPath: string; message: string }) => {
      updateStepRef(e.stepPath, { status: "waiting_human" });
      appendLog(e.stepPath, `◌ Waiting: ${e.message}`);
    };

    const onEngineComplete = (e: { durationMs: number }) => {
      engineStatusRef.current = "completed";
      engineDurationRef.current = e.durationMs;
      markDirty();
    };

    const onEngineFailed = () => {
      engineStatusRef.current = "failed";
      markDirty();
    };

    const onEngineAborted = () => {
      engineStatusRef.current = "aborted";
      markDirty();
    };

    emitter.on("step_start", onStepStart);
    emitter.on("step_complete", onStepComplete);
    emitter.on("step_failed", onStepFailed);
    emitter.on("step_log", onStepLog);
    emitter.on("loop_iteration", onLoopIteration);
    emitter.on("waiting_human", onWaitingHuman);
    emitter.on("engine_complete", onEngineComplete);
    emitter.on("engine_failed", onEngineFailed);
    emitter.on("engine_aborted", onEngineAborted);

    return () => {
      emitter.removeAllListeners();
    };
  }, [emitter]);

  return {
    steps,
    logs,
    selectedIndex,
    autoFollow,
    engineStatus,
    engineDurationMs,
    hasRunningStep,
    moveSelection,
    flush,
  };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m${rs}s`;
}
