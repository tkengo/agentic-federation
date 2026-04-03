import React, { useState, useEffect, useRef, useMemo, memo } from "react";
import { Text, Box, Static, useInput, useStdout } from "ink";
import type { EngineEventEmitter } from "../events.js";
import type { StepNode } from "./types.js";
import { useEngineEvents, type LogEntry } from "./useEngineEvents.js";
import { computeColumnWidths, type ColumnWidths } from "./StepRow.js";
import { writeAbortRequest } from "../abort.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const STEP_TREE_VISIBLE = 12;

interface EngineAppProps {
  emitter: EngineEventEmitter;
  initialSteps: StepNode[];
  workflowName: string;
  sessionDir: string;
}

type ViewMode = "steps" | "log";

export function EngineApp({ emitter, initialSteps, workflowName, sessionDir }: EngineAppProps): React.ReactElement {
  const { steps, logs, selectedIndex, autoFollow, engineStatus, engineDurationMs, hasRunningStep, moveSelection, flush } =
    useEngineEvents(emitter, initialSteps);

  const [viewMode, setViewMode] = useState<ViewMode>("steps");
  const [logViewStepPath, setLogViewStepPath] = useState("");

  // Spinner: only runs in steps view
  const [spinnerFrame, setSpinnerFrame] = useState(0);
  const spinnerRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const wasDirty = flush();
      if (viewMode === "steps" && hasRunningStep) {
        spinnerRef.current += 1;
        setSpinnerFrame(spinnerRef.current);
      } else if (!wasDirty) {
        return;
      }
    }, 80);
    return () => clearInterval(timer);
  }, [flush, hasRunningStep, viewMode]);

  // Keyboard input
  useInput((input, key) => {
    if (viewMode === "steps") {
      const isUp = key.upArrow || input === "k" || (key.ctrl && input === "p");
      const isDown = key.downArrow || input === "j" || (key.ctrl && input === "n");
      if (isUp) moveSelection(-1);
      if (isDown) moveSelection(1);
      if (input === " ") {
        // Open log view only for action steps
        const selected = steps[selectedIndex];
        if (selected && ["claude", "codex", "shell", "human"].includes(selected.stepType)) {
          setLogViewStepPath(selected.stepPath);
          process.stdout.write("\x1b[2J\x1b[H");
          setViewMode("log");
        }
      }
      // Abort (immediate): 'a' key
      if (input === "a" && (engineStatus === "running" || engineStatus === "waiting_network")) {
        writeAbortRequest(sessionDir, "immediate");
      }
      // Graceful abort: 'g' key
      if (input === "g" && (engineStatus === "running" || engineStatus === "waiting_network")) {
        writeAbortRequest(sessionDir, "graceful");
      }
    } else {
      // In log view, space/q/Esc goes back
      if (input === " " || input === "q" || key.escape) {
        process.stdout.write("\x1b[2J\x1b[H");
        setViewMode("steps");
      }
    }
  });

  if (viewMode === "log") {
    return <LogView stepPath={logViewStepPath} logs={logs} steps={steps} />;
  }

  return <StepsView
    steps={steps}
    logs={logs}
    selectedIndex={selectedIndex}
    autoFollow={autoFollow}
    engineStatus={engineStatus}
    engineDurationMs={engineDurationMs}
    spinnerFrame={spinnerFrame}
    workflowName={workflowName}
    sessionDir={sessionDir}
  />;
}

// ---------------------------------------------------------------------------
// Steps View (normal dashboard)
// ---------------------------------------------------------------------------

function StepsView({ steps, logs, selectedIndex, autoFollow, engineStatus, engineDurationMs, spinnerFrame, workflowName, sessionDir }: {
  steps: StepNode[];
  logs: Map<string, LogEntry[]>;
  selectedIndex: number;
  autoFollow: boolean;
  engineStatus: string;
  engineDurationMs?: number;
  spinnerFrame: number;
  workflowName: string;
  sessionDir: string;
}): React.ReactElement {
  const colWidths = useMemo(() => computeColumnWidths(steps), [steps]);

  // Compute max step label width from all steps for log prefix alignment
  const logLabelMaxLen = useMemo(() => {
    const MAX_LABEL_LEN = 16;
    let maxLen = 0;
    for (const s of steps) {
      const label = s.stepPath.split(".").pop() ?? s.stepPath;
      maxLen = Math.max(maxLen, label.length);
    }
    return Math.min(maxLen, MAX_LABEL_LEN);
  }, [steps]);

  // Track terminal rows for dynamic padding on resize
  const [termRows, setTermRows] = useState(process.stdout.rows ?? 40);

  useEffect(() => {
    const onResize = (): void => {
      setTermRows(process.stdout.rows ?? 40);
    };
    process.stdout.on("resize", onResize);
    return () => { process.stdout.off("resize", onResize); };
  }, []);

  // Mark skipped steps: not_started steps that appear before any started/completed step
  const displaySteps = useMemo(() => {
    let lastActiveIndex = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (steps[i].status !== "not_started" && steps[i].status !== "skipped") {
        lastActiveIndex = i;
        break;
      }
    }
    return steps.map((s, i) => {
      if (i < lastActiveIndex && s.status === "not_started") {
        return { ...s, status: "skipped" as const };
      }
      return s;
    });
  }, [steps]);

  // Static log lines
  const lastLogCountRef = useRef<Map<string, number>>(new Map());
  const [staticLogLines, setStaticLogLines] = useState<Array<{ key: string; timestamp?: string; text: string; color?: string }>>(() => {
    const rows = process.stdout.rows ?? 40;
    const dynamicLines = STEP_TREE_VISIBLE + 3;
    const padLines = Math.max(0, rows - dynamicLines);
    return Array.from({ length: padLines }, (_, i) => ({
      key: `_pad_${i}`,
      text: " ",
    }));
  });

  useEffect(() => {
    const pending: Array<{ key: string; timestamp?: string; text: string; color?: string }> = [];
    for (const [stepPath, entries] of logs.entries()) {
      const lastSeen = lastLogCountRef.current.get(stepPath) ?? 0;
      // Find step label for prefix
      const stepLabel = stepPath.split(".").pop() ?? stepPath;
      for (let i = lastSeen; i < entries.length; i++) {
        const entry = entries[i];
        pending.push({
          key: `${stepPath}-${i}`,
          timestamp: formatLogTimestamp(entry.timestamp),
          text: `  ${dimPrefix(stepLabel, logLabelMaxLen)} ${entry.message}`,
          color: getLogColor(entry.message),
        });
      }
      lastLogCountRef.current.set(stepPath, entries.length);
    }
    if (pending.length > 0) {
      setStaticLogLines((prev) => [...prev, ...pending]);
    }
  }, [logs, logLabelMaxLen]);

  // Step tree viewport — scroll only when cursor reaches the edge
  const treeStartRef = useRef(0);
  if (selectedIndex < treeStartRef.current) {
    // Cursor moved above visible area: scroll up
    treeStartRef.current = selectedIndex;
  } else if (selectedIndex >= treeStartRef.current + STEP_TREE_VISIBLE) {
    // Cursor moved below visible area: scroll down
    treeStartRef.current = selectedIndex - STEP_TREE_VISIBLE + 1;
  }
  const treeStart = treeStartRef.current;
  const visibleSteps = displaySteps.slice(treeStart, treeStart + STEP_TREE_VISIBLE);

  // Dynamic padding to pin workflow area to terminal bottom
  const hasMoreBelow = treeStart + STEP_TREE_VISIBLE < displaySteps.length;
  const workflowAreaLines = 1 + 1 + visibleSteps.length + (hasMoreBelow ? 1 : 0);
  const staticCount = staticLogLines.length;
  const dynamicPadCount = Math.max(0, termRows - staticCount - workflowAreaLines);

  // Status
  const statusText = engineStatus === "completed"
    ? `✓ Completed (${formatDuration(engineDurationMs ?? 0)})`
    : engineStatus === "failed"
      ? "✗ Failed"
      : engineStatus === "aborted"
        ? "⏸ Aborted"
        : engineStatus === "waiting_network"
          ? "⟳ Waiting for network..."
          : autoFollow ? "running" : "manual nav";
  const statusColor = engineStatus === "completed" ? "green"
    : engineStatus === "failed" ? "red"
      : engineStatus === "aborted" ? "yellow"
        : engineStatus === "waiting_network" ? "magenta"
          : "cyan";
  const completedCount = displaySteps.filter((s) => s.status === "completed").length;
  const canAbort = engineStatus === "running" || engineStatus === "waiting_network";
  const hintText = canAbort
    ? "[space: view log]  [a: abort]  [g: graceful abort]"
    : "[space: view log]";

  return (
    <Box flexDirection="column">
      <Static items={staticLogLines}>
        {(item) => (
          <Text key={item.key} wrap="truncate">
            {item.timestamp ? <Text dimColor>{item.timestamp} </Text> : null}
            <Text color={item.color}>{item.text}</Text>
          </Text>
        )}
      </Static>

      {/* Dynamic padding to pin workflow area to bottom */}
      {dynamicPadCount > 0 && Array.from({ length: dynamicPadCount }, (_, i) => (
        <Text key={`dpad_${i}`}>{" "}</Text>
      ))}

      <Text dimColor>{"─".repeat(process.stdout.columns ?? 80)}</Text>

      <Box>
        <Text bold color="cyan">⚡ {workflowName}</Text>
        <Text>{"  "}</Text>
        <Text color={statusColor}>{statusText}</Text>
        <Text dimColor>{"  "}{hintText}</Text>
        {treeStart > 0 ? <Text dimColor>{"  ↑"}</Text> : null}
      </Box>

      {visibleSteps.map((node, i) => (
        <MemoStepLine
          key={node.stepPath}
          node={node}
          selected={treeStart + i === selectedIndex}
          colWidths={colWidths}
        />
      ))}

      {treeStart + STEP_TREE_VISIBLE < displaySteps.length ? (
        <Text dimColor>{"  ↓ "}{displaySteps.length - treeStart - STEP_TREE_VISIBLE} more</Text>
      ) : null}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Log View (full screen, no spinner, no flicker)
// ---------------------------------------------------------------------------

function LogView({ stepPath, logs, steps }: {
  stepPath: string;
  logs: Map<string, LogEntry[]>;
  steps: StepNode[];
}): React.ReactElement {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 40;
  const logEntries = logs.get(stepPath) ?? [];
  const step = steps.find((s) => s.stepPath === stepPath);
  const label = step?.label ?? stepPath;
  const status = step ? `${getStaticIcon(step.status)} ${getRightInfo(step)}` : "";

  // Show as many lines as fit on screen
  const headerLines = 2;
  const visibleCount = rows - headerLines;
  const tail = logEntries.slice(-visibleCount);

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">{`─── ${label} ───`}</Text>
        <Text>{"  "}</Text>
        <Text dimColor>{status}</Text>
        <Text dimColor>{"  [space: back]"}</Text>
      </Box>
      {tail.length === 0 ? (
        <Text dimColor>{"  (no output)"}</Text>
      ) : (
        tail.map((entry, i) => (
          <Text key={i} wrap="truncate">
            <Text dimColor>{formatLogTimestamp(entry.timestamp)} </Text>
            {"  "}{colorizeLog(entry.message)}
          </Text>
        ))
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// SpinnerIcon
// ---------------------------------------------------------------------------

function SpinnerIcon(): React.ReactElement {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setFrame((f) => f + 1), 80);
    return () => clearInterval(timer);
  }, []);
  return <Text color="cyan">{SPINNER_FRAMES[frame % SPINNER_FRAMES.length]}</Text>;
}

function BlinkIcon({ icon, color = "cyan" }: { icon: string; color?: string }): React.ReactElement {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setOn((v) => !v), 600);
    return () => clearInterval(timer);
  }, []);
  return <Text color={color} dimColor={!on}>{icon}</Text>;
}

// ---------------------------------------------------------------------------
// StepLine — memoized
// ---------------------------------------------------------------------------

interface StepLineProps {
  node: StepNode;
  selected: boolean;
  colWidths: ColumnWidths;
}

const MemoStepLine = memo(function StepLine({ node, selected, colWidths }: StepLineProps): React.ReactElement {
  const indent = "  ".repeat(node.depth);
  const cursor = selected ? ">" : " ";
  const iconColor = getStatusColor(node.status);

  const isActionStep = ["claude", "codex", "shell", "human"].includes(node.stepType);
  let icon: React.ReactElement;
  if (node.status === "waiting_network" && isActionStep) {
    icon = <BlinkIcon icon="⟳" color="magenta" />;
  } else if (node.status === "running" && isActionStep) {
    icon = <SpinnerIcon />;
  } else if (node.status === "running" && !isActionStep) {
    // Parent control-flow step with running children: blink
    icon = <BlinkIcon icon="▸" />;
  } else {
    icon = <Text color={selected ? "cyan" : iconColor}>{getStaticIcon(node.status)}</Text>;
  }

  const namePlainLen = 3 + node.depth * 2 + 1 + 1 + node.label.length;
  const namePad = " ".repeat(Math.max(0, colWidths.nameCol - namePlainLen));

  let condStr = "";
  if (colWidths.conditionCol > 0 && node.condition) {
    condStr = formatCondition(node.condition);
  }
  const condPad = colWidths.conditionCol > 0
    ? " ".repeat(Math.max(0, colWidths.conditionCol + 2 - condStr.length))
    : "";

  const rightInfo = getRightInfo(node);

  // Dim for not_started/skipped, white for completed/running/waiting/failed
  const isDim = node.status === "not_started" || node.status === "skipped";
  const textColor = selected ? "cyan" : undefined;

  return (
    <Box>
      <Text color={textColor} bold={selected} dimColor={isDim && !selected}>
        {` ${cursor} `}{indent}
      </Text>
      {icon}
      <Text color={textColor} bold={selected} dimColor={isDim && !selected}>
        {" "}{node.label}
      </Text>
      <Text dimColor={isDim && !selected}>{namePad}</Text>
      {condStr ? <Text dimColor>{condStr}</Text> : null}
      <Text dimColor={isDim && !selected}>{condPad}</Text>
      {rightInfo ? <Text dimColor={isDim && !selected}>{"  "}{rightInfo}</Text> : null}
    </Box>
  );
}, (prev, next) => {
  return prev.node.status === next.node.status
    && prev.node.result === next.node.result
    && prev.node.durationMs === next.node.durationMs
    && prev.node.iterationLabel === next.node.iterationLabel
    && prev.selected === next.selected
    && prev.colWidths === next.colWidths;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLogTimestamp(date: Date): string {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function dimPrefix(label: string, maxLen: number): string {
  const truncated = label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;
  const pad = " ".repeat(Math.max(0, maxLen - truncated.length));
  return `[${truncated}]${pad}`;
}

function getStaticIcon(status: StepNode["status"]): string {
  switch (status) {
    case "completed": return "✓";
    case "running": return "▸";
    case "waiting_human": return "◌";
    case "waiting_network": return "⟳";
    case "failed": return "✗";
    case "skipped": return "─";
    case "not_started": return "○";
  }
}

function getStatusColor(status: StepNode["status"]): string {
  switch (status) {
    case "completed": return "green";
    case "running": return "cyan";
    case "waiting_human": return "yellow";
    case "waiting_network": return "magenta";
    case "failed": return "red";
    case "skipped": return "gray";
    case "not_started": return "gray";
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
  if (node.status === "waiting_network") return "waiting network";
  if (node.status === "skipped") return "skipped";
  return "";
}

function getLogColor(line: string): string | undefined {
  if (line.startsWith("✓")) return "green";
  if (line.startsWith("✗")) return "red";
  if (line.startsWith("◌")) return "yellow";
  if (line.startsWith("⟳")) return "magenta";
  if (line.startsWith("▶")) return "cyan";
  if (line.startsWith("⚠")) return "yellow";
  if (line.includes("🔧")) return "blue";
  return undefined;
}

function colorizeLog(line: string): React.ReactElement {
  if (line.startsWith("✓")) return <Text color="green">{line}</Text>;
  if (line.startsWith("✗")) return <Text color="red">{line}</Text>;
  if (line.startsWith("◌")) return <Text color="yellow">{line}</Text>;
  if (line.startsWith("⟳")) return <Text color="magenta">{line}</Text>;
  if (line.startsWith("▶")) return <Text color="cyan">{line}</Text>;
  if (line.startsWith("⚠")) return <Text color="yellow">{line}</Text>;
  if (line.includes("🔧")) return <Text color="blue">{line}</Text>;
  return <Text>{line}</Text>;
}

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
