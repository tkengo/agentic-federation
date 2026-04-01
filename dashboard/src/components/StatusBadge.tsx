import React from "react";
import { Text } from "ink";

interface StatusBadgeProps {
  status: string;
  currentStep?: string | null;
  waitingReason?: string | null;
  stale?: boolean;
  stateMtimeMs?: number;
}

// Icon and color per engine status
const STATUS_STYLE: Record<string, { mark: string; color: string }> = {
  running: { mark: "▶", color: "cyan" },
  waiting_human: { mark: "◌", color: "yellow" },
  completed: { mark: "✓", color: "green" },
  failed: { mark: "✗", color: "red" },
};

const DEFAULT_STYLE = { mark: "●", color: "white" };

// Terminal statuses that should never show as stale
const TERMINAL_STATUSES = new Set(["completed", "failed", "waiting_human"]);

export function StatusBadge({ status, currentStep, waitingReason, stale, stateMtimeMs }: StatusBadgeProps) {
  const style = STATUS_STYLE[status] ?? DEFAULT_STYLE;
  const isStale = stale && !TERMINAL_STATUSES.has(status);

  // Determine label: current step for running/waiting_human, status name for terminal states
  let label: string;
  if (status === "completed" || status === "failed") {
    label = status;
  } else {
    label = currentStep ?? status;
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

  // For waiting_human, append reason inline
  const reason = status === "waiting_human" && waitingReason
    ? ` ${waitingReason}`
    : "";

  return (
    <Text color={style.color}>
      {style.mark} {label}{elapsed}{reason}
    </Text>
  );
}
