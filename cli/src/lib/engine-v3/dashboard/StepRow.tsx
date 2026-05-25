import React from "react";
import { Text, Box } from "ink";
import type { StepNode } from "./types.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface ColumnWidths {
  /** Width for " > " + indent + icon + " " + label */
  nameCol: number;
  /** Width for condition column (0 if no steps have conditions) */
  conditionCol: number;
}

interface StepRowProps {
  node: StepNode;
  selected: boolean;
  spinnerFrame: number;
  columnWidths: ColumnWidths;
}

/**
 * Compute column widths from all steps so every row aligns.
 */
export function computeColumnWidths(steps: StepNode[]): ColumnWidths {
  let maxName = 0;
  let maxCondition = 0;

  for (const s of steps) {
    // " > " (3) + indent (depth*2) + icon (1) + " " (1) + label
    const nameWidth = 3 + s.depth * 2 + 1 + 1 + s.label.length;
    if (nameWidth > maxName) maxName = nameWidth;

    if (s.condition) {
      const condWidth = formatCondition(s.condition).length;
      if (condWidth > maxCondition) maxCondition = condWidth;
    }
  }

  return {
    nameCol: maxName + 1, // +1 for breathing room
    conditionCol: maxCondition,
  };
}

export function StepRow({ node, selected, spinnerFrame, columnWidths }: StepRowProps): React.ReactElement {
  const indent = "  ".repeat(node.depth);
  const cursor = selected ? ">" : " ";
  const icon = getStatusIcon(node.status, spinnerFrame);
  const iconColor = getStatusColor(node.status);

  // Build name column and pad to fixed width
  const nameStr = ` ${cursor} ${indent}${icon} ${node.label}`;
  const paddedName = nameStr.padEnd(columnWidths.nameCol);

  // Build condition column and pad to fixed width
  const condStr = node.condition ? formatCondition(node.condition) : "";
  const paddedCond = columnWidths.conditionCol > 0
    ? condStr.padEnd(columnWidths.conditionCol + 2) // +2 for spacing
    : "";

  const rightInfo = getRightInfo(node);

  return (
    <Box>
      <Text color={selected ? "cyan" : undefined} bold={selected}>
        {paddedName.slice(0, 3)}
        {paddedName.slice(3, 3 + node.depth * 2)}
        <Text color={selected ? "cyan" : iconColor}>{paddedName.slice(3 + node.depth * 2, 3 + node.depth * 2 + 1)}</Text>
        {paddedName.slice(3 + node.depth * 2 + 1)}
      </Text>
      {paddedCond ? (
        <Text dimColor>{paddedCond}</Text>
      ) : null}
      {rightInfo ? (
        <Text dimColor>{rightInfo}</Text>
      ) : null}
    </Box>
  );
}

function getStatusIcon(status: StepNode["status"], frame: number): string {
  switch (status) {
    case "completed": return "✓";
    case "running": return SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
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

/**
 * Format ${{ expr }} condition for display.
 * Strips the ${{ }} wrapper if present, shows as parenthesized.
 */
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `${m}m${rs}s`;
}
