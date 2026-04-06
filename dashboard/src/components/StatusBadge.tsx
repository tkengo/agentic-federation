import React from "react";
import { Text } from "ink";

interface StatusBadgeProps {
  status: string;
  currentStep?: string | null;
  stale?: boolean;
  stateMtimeMs?: number;
  highlight?: boolean;
  dimColor?: boolean;
}

// Icon and color per engine status
const STATUS_STYLE: Record<string, { mark: string; color: string }> = {
  running: { mark: "▶", color: "cyan" },
  waiting_human: { mark: "◌", color: "yellow" },
  completed: { mark: "✓", color: "green" },
  failed: { mark: "✗", color: "red" },
  disconnected: { mark: "⚠", color: "red" },
};

const DEFAULT_STYLE = { mark: "●", color: "white" };

// Terminal statuses that should never show as stale
const TERMINAL_STATUSES = new Set(["completed", "failed", "waiting_human"]);

/**
 * Compute the display width of the status label (icon + space + label + elapsed).
 * Used by SessionList to calculate column width.
 */
export function statusDisplayWidth(status: string, currentStep?: string | null, stale?: boolean, stateMtimeMs?: number, waiting?: boolean): number {
  const label = (status === "completed" || status === "failed")
    ? status
    : (currentStep ? currentStep.split(".").pop()! : status);

  let elapsed = "";
  const isStale = stale && !TERMINAL_STATUSES.has(status);
  if (isStale && stateMtimeMs != null) {
    const diffMs = Date.now() - stateMtimeMs;
    const minutes = Math.floor(diffMs / 60_000);
    elapsed = minutes < 60 ? ` (${minutes}m)` : ` (${Math.floor(minutes / 60)}h)`;
  }

  const waitingWidth = waiting ? 4 : 0; // " [!]" = 4 chars

  // "▶ label(elapsed) [!]" → mark(1) + space(1) + label + elapsed + waiting + buffer(2)
  return 2 + label.length + elapsed.length + waitingWidth + 2;
}

export function StatusBadge({ status, currentStep, stale, stateMtimeMs, highlight, dimColor }: StatusBadgeProps) {
  const style = STATUS_STYLE[status] ?? DEFAULT_STYLE;
  const isStale = stale && !TERMINAL_STATUSES.has(status);

  // Determine label: shortened step name for running/waiting_human, status name for terminal states
  let label: string;
  if (status === "completed" || status === "failed") {
    label = status;
  } else {
    label = currentStep ? currentStep.split(".").pop()! : status;
  }

  // Append elapsed time for stale non-terminal statuses
  let elapsed = "";
  if (isStale && stateMtimeMs != null) {
    const diffMs = Date.now() - stateMtimeMs;
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) {
      elapsed = ` (${minutes}m)`;
    } else {
      const hours = Math.floor(minutes / 60);
      elapsed = ` (${hours}h)`;
    }
  }

  return (
    <Text color={highlight ? "cyan" : style.color} bold={highlight} dimColor={dimColor}>
      {style.mark} {label}{elapsed}
    </Text>
  );
}
