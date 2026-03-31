/**
 * Engine v2 dashboard — Ink-free, ANSI-based, double-buffered.
 * Subscribes to EngineEventEmitter and renders a step tree + log panel.
 */

import type { EngineEventEmitter } from "../events.js";
import type { V2Workflow } from "../types.js";
import type { StepNode, StepStatus } from "./types.js";
import { buildStepTree } from "./build-step-tree.js";
import { TerminalRenderer, color } from "./renderer.js";

const MAX_LOG_LINES = 500;
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface DashboardState {
  steps: StepNode[];
  logs: Map<string, string[]>;
  selectedIndex: number;
  autoFollow: boolean;
  engineStatus: "running" | "completed" | "failed";
  engineDurationMs?: number;
  spinnerFrame: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function startDashboard(
  emitter: EngineEventEmitter,
  workflow: V2Workflow,
): { cleanup: () => void } {
  const renderer = new TerminalRenderer();
  renderer.enter();

  const state: DashboardState = {
    steps: buildStepTree(workflow),
    logs: new Map(),
    selectedIndex: 0,
    autoFollow: true,
    engineStatus: "running",
    spinnerFrame: 0,
  };

  let manualNavTime = 0;

  // --- Event handlers ---

  const updateStep = (stepPath: string, updates: Partial<StepNode>): void => {
    state.steps = state.steps.map((s) =>
      s.stepPath === stepPath ? { ...s, ...updates } : s,
    );
  };

  const setParentRunning = (stepPath: string): void => {
    const parts = stepPath.split(".");
    for (let i = parts.length - 1; i >= 1; i--) {
      const parentPath = parts.slice(0, i).join(".");
      state.steps = state.steps.map((s) => {
        if (s.stepPath === parentPath && s.status === "not_started") {
          return { ...s, status: "running" as StepStatus };
        }
        return s;
      });
    }
  };

  const appendLog = (stepPath: string, message: string): void => {
    const existing = state.logs.get(stepPath) ?? [];
    existing.push(message);
    if (existing.length > MAX_LOG_LINES) {
      existing.splice(0, existing.length - MAX_LOG_LINES);
    }
    state.logs.set(stepPath, existing);
  };

  emitter.on("step_start", (e) => {
    updateStep(e.stepPath, { status: "running" });
    setParentRunning(e.stepPath);
    appendLog(e.stepPath, `▶ Starting (${e.stepType})${e.description ? ` - ${e.description}` : ""}`);
    if (state.autoFollow) {
      const idx = state.steps.findIndex((s) => s.stepPath === e.stepPath);
      if (idx >= 0) state.selectedIndex = idx;
    }
  });

  emitter.on("step_complete", (e) => {
    updateStep(e.stepPath, {
      status: "completed",
      result: e.result,
      durationMs: e.durationMs,
    });
    appendLog(e.stepPath, `✓ Completed${e.result ? ` → ${e.result}` : ""} (${formatDuration(e.durationMs)})`);
  });

  emitter.on("step_failed", (e) => {
    updateStep(e.stepPath, { status: "failed", durationMs: e.durationMs });
    appendLog(e.stepPath, `✗ Failed: ${e.error}`);
  });

  emitter.on("step_log", (e) => {
    appendLog(e.stepPath, e.message);
  });

  emitter.on("loop_iteration", (e) => {
    updateStep(e.stepPath, { iterationLabel: `${e.iteration}/${e.max}` });
  });

  emitter.on("waiting_human", (e) => {
    updateStep(e.stepPath, { status: "waiting_human" });
    appendLog(e.stepPath, `◌ Waiting: ${e.message}`);
  });

  emitter.on("engine_complete", (e) => {
    state.engineStatus = "completed";
    state.engineDurationMs = e.durationMs;
  });

  emitter.on("engine_failed", () => {
    state.engineStatus = "failed";
  });

  // --- Keyboard input ---

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.resume();
  process.stdin.setEncoding("utf-8");

  const onKeypress = (data: string): void => {
    if (data === "\x1b[A") { // up arrow
      state.autoFollow = false;
      manualNavTime = Date.now();
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      renderFrame(renderer, state, workflow.name);

      scheduleAutoFollowRestore();
    } else if (data === "\x1b[B") { // down arrow
      state.autoFollow = false;
      manualNavTime = Date.now();
      state.selectedIndex = Math.min(state.steps.length - 1, state.selectedIndex + 1);
      renderFrame(renderer, state, workflow.name);

      scheduleAutoFollowRestore();
    } else if (data === "q" || data === "\x03") { // q or ctrl+c
      cleanup();
      process.exit(0);
    }
  };

  const scheduleAutoFollowRestore = (): void => {
    setTimeout(() => {
      if (Date.now() - manualNavTime >= 9500) {
        state.autoFollow = true;
      }
    }, 10000);
  };

  process.stdin.on("data", onKeypress);

  // --- Render loop ---

  const timer = setInterval(() => {
    state.spinnerFrame += 1;
    renderFrame(renderer, state, workflow.name);
  }, 80);

  // Initial render
  renderFrame(renderer, state, workflow.name);

  // --- Cleanup ---

  const cleanup = (): void => {
    clearInterval(timer);
    process.stdin.off("data", onKeypress);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }
    process.stdin.pause();
    renderer.exit();
  };

  return { cleanup };
}

// ---------------------------------------------------------------------------
// Frame rendering
// ---------------------------------------------------------------------------

function renderFrame(renderer: TerminalRenderer, state: DashboardState, workflowName: string): void {
  const { rows } = renderer.getSize();
  const lines: string[] = [];

  // Header
  const statusText = state.engineStatus === "completed"
    ? color.green(`✓ Completed (${formatDuration(state.engineDurationMs ?? 0)})`)
    : state.engineStatus === "failed"
      ? color.red("✗ Failed")
      : state.autoFollow
        ? color.cyan("running (auto-follow)")
        : color.cyan("running (manual nav)");

  lines.push(`${color.boldCyan("⚡ Engine v2")}${color.dim(` ▸ ${workflowName}`)}  ${statusText}`);

  // Layout
  const headerHeight = 2;
  const footerHeight = 1;
  const contentHeight = rows - headerHeight - footerHeight;
  const treeHeight = Math.max(5, Math.floor(contentHeight * 0.4));
  const logHeight = Math.max(3, contentHeight - treeHeight - 1);

  // Step tree header
  lines.push(`${color.bold(" Steps")}  ${color.dim("[↑↓ to navigate]")}`);

  // Compute column widths
  const colWidths = computeColumnWidths(state.steps);

  // Viewport
  const visibleCount = Math.max(1, treeHeight - 1); // -1 for header
  let startIndex = 0;
  if (state.selectedIndex >= startIndex + visibleCount) {
    startIndex = state.selectedIndex - visibleCount + 1;
  }

  for (let i = 0; i < visibleCount; i++) {
    const idx = startIndex + i;
    if (idx < state.steps.length) {
      lines.push(renderStepRow(state.steps[idx], idx === state.selectedIndex, state.spinnerFrame, colWidths));
    } else {
      lines.push("");
    }
  }

  // Divider + log panel
  const selectedStep = state.steps[state.selectedIndex];
  const selectedLabel = selectedStep?.label ?? "";
  const selectedPath = selectedStep?.stepPath ?? "";
  lines.push(color.dim(`─── ${selectedLabel} ───`));

  const logLines = state.logs.get(selectedPath) ?? [];
  const logVisibleCount = Math.max(1, logHeight - 1);
  const logStart = Math.max(0, logLines.length - logVisibleCount);

  for (let i = 0; i < logVisibleCount; i++) {
    const li = logStart + i;
    if (li < logLines.length) {
      lines.push("  " + colorizeLog(logLines[li]));
    } else {
      lines.push("");
    }
  }

  // Footer
  const completedCount = state.steps.filter((s) => s.status === "completed").length;
  lines.push(color.dim(`${completedCount}/${state.steps.length} steps │ ${selectedPath}`));

  renderer.draw(lines);
}

// ---------------------------------------------------------------------------
// Step row rendering
// ---------------------------------------------------------------------------

interface ColWidths {
  nameCol: number;
  conditionCol: number;
}

function computeColumnWidths(steps: StepNode[]): ColWidths {
  let maxName = 0;
  let maxCondition = 0;

  for (const s of steps) {
    const nameWidth = 3 + s.depth * 2 + 1 + 1 + s.label.length;
    if (nameWidth > maxName) maxName = nameWidth;
    if (s.condition) {
      const condWidth = formatCondition(s.condition).length;
      if (condWidth > maxCondition) maxCondition = condWidth;
    }
  }

  return { nameCol: maxName + 1, conditionCol: maxCondition };
}

function renderStepRow(node: StepNode, selected: boolean, spinnerFrame: number, colWidths: ColWidths): string {
  const indent = "  ".repeat(node.depth);
  const cursor = selected ? ">" : " ";
  const icon = getStatusIcon(node.status, spinnerFrame);

  // Build name portion (plain text for padding)
  const namePlain = ` ${cursor} ${indent}${icon} ${node.label}`;
  const padded = namePlain.padEnd(colWidths.nameCol);

  // Colorize icon
  const iconColored = colorizeIcon(icon, node.status);
  const nameColored = ` ${cursor} ${indent}${iconColored} ${node.label}`;
  // Calculate padding needed (difference between padded and plain name)
  const padding = " ".repeat(Math.max(0, colWidths.nameCol - namePlain.length));

  // Condition column
  let condStr = "";
  if (colWidths.conditionCol > 0) {
    const cond = node.condition ? formatCondition(node.condition) : "";
    condStr = cond.padEnd(colWidths.conditionCol + 2);
  }

  // Right info
  const rightInfo = getRightInfo(node);

  // Assemble
  let row = nameColored + padding;
  if (condStr.trim()) {
    row += color.dim(condStr);
  } else if (condStr) {
    row += condStr; // just spaces for alignment
  }
  if (rightInfo) {
    row += color.dim(rightInfo);
  }

  // Apply selection highlight
  if (selected) {
    row = color.boldCyan(stripAnsi(row));
  }

  return row;
}

function getStatusIcon(status: StepStatus, frame: number): string {
  switch (status) {
    case "completed": return "✓";
    case "running": return SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    case "waiting_human": return "◌";
    case "failed": return "✗";
    case "skipped": return "─";
    case "not_started": return "○";
  }
}

function colorizeIcon(icon: string, status: StepStatus): string {
  switch (status) {
    case "completed": return color.green(icon);
    case "running": return color.cyan(icon);
    case "waiting_human": return color.yellow(icon);
    case "failed": return color.red(icon);
    case "skipped": return color.dim(icon);
    case "not_started": return color.dim(icon);
  }
}

function formatCondition(condition: string): string {
  let expr = condition.trim();
  if (expr.startsWith("${{") && expr.endsWith("}}")) {
    expr = expr.slice(3, -2).trim();
  }
  return `(${expr})`;
}

function getRightInfo(node: StepNode): string {
  if (node.status === "completed" && node.durationMs !== undefined) {
    const dur = formatDuration(node.durationMs);
    return node.result ? `${node.result}  ${dur}` : `done  ${dur}`;
  }
  if (node.status === "running" && node.iterationLabel) {
    return node.iterationLabel;
  }
  if (node.status === "running") return "running";
  if (node.status === "waiting_human") return "waiting";
  return "";
}

function colorizeLog(line: string): string {
  if (line.startsWith("✓")) return color.green(line);
  if (line.startsWith("✗")) return color.red(line);
  if (line.startsWith("◌")) return color.yellow(line);
  if (line.startsWith("▶")) return color.cyan(line);
  if (line.startsWith("⚠")) return color.yellow(line);
  if (line.includes("🔧")) return color.dim(line);
  return line;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
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

// Simple ANSI strip (remove escape sequences)
function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
