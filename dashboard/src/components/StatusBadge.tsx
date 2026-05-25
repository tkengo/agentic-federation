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

// Icon and color per engine status.
// Only "outcome" statuses get an icon; in-flight statuses (running, waiting_human,
// waiting_network, custom labels) intentionally show no icon — the agent_state
// indicator on the right ([!] / ▶ / ○) carries that signal instead.
// `aborted` is treated as failed for display purposes.
const STATUS_STYLE: Record<string, { mark: string; color: string }> = {
  completed: { mark: "✓", color: "green" },
  failed: { mark: "✗", color: "red" },
  aborted: { mark: "✗", color: "red" },
  disconnected: { mark: "⚠", color: "red" },
};

// Statuses without an icon still get a color so the label remains readable.
const DEFAULT_STYLE = { mark: null as string | null, color: "white" };

// Terminal statuses that should never show as stale
const TERMINAL_STATUSES = new Set(["completed", "failed", "aborted", "waiting_human"]);

/**
 * Compute the display width of the status label (icon + space + label + elapsed).
 * Used by SessionList to calculate column width.
 */
export function statusDisplayWidth(status: string, currentStep?: string | null, stale?: boolean, stateMtimeMs?: number, waiting?: boolean): number {
  const label = (status === "completed" || status === "failed" || status === "aborted")
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
  const markWidth = STATUS_STYLE[status] ? 2 : 0; // mark(1) + space(1) if present

  // "[▶ ]label(elapsed) [!]" → mark(0|2) + label + elapsed + waiting + buffer(2)
  return markWidth + label.length + elapsed.length + waitingWidth + 2;
}

export function StatusBadge({ status, currentStep, stale, stateMtimeMs, highlight, dimColor }: StatusBadgeProps) {
  const style = STATUS_STYLE[status] ?? DEFAULT_STYLE;
  const isStale = stale && !TERMINAL_STATUSES.has(status);

  // Determine label: shortened step name for in-flight statuses, status name for terminal states
  let label: string;
  if (status === "completed" || status === "failed" || status === "aborted") {
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
      {style.mark ? `${style.mark} ` : ""}{label}{elapsed}
    </Text>
  );
}
