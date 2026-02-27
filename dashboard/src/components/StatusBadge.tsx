import React from "react";
import { Text } from "ink";
import type { StatusConfig } from "../utils/types.js";

interface StatusBadgeProps {
  status: string;
  stale?: boolean;
  blinkOn?: boolean;
  statusConfigMap?: Record<string, StatusConfig>;
  stateMtimeMs?: number;
}

const DEFAULT_STATUS_CONFIG: Record<string, StatusConfig> = {
  planning: { icon: "~", color: "blue" },
  plan_review: { icon: "*", color: "yellow" },
  plan_revision: { icon: "~", color: "yellow" },
  implementing: { icon: "~", color: "blue" },
  code_review: { icon: "*", color: "yellow" },
  code_revision: { icon: "~", color: "yellow" },
  waiting_human: { icon: "!", color: "magenta" },
  completed: { icon: "+", color: "green" },
  approved: { icon: "+", color: "green" },
  active: { icon: "-", color: "cyan" },
};

// Terminal statuses that should never show as stale
const TERMINAL_STATUSES = new Set(["completed", "approved", "waiting_human"]);

export function StatusBadge({ status, stale, blinkOn, statusConfigMap, stateMtimeMs }: StatusBadgeProps) {
  const config = statusConfigMap?.[status] ?? DEFAULT_STATUS_CONFIG[status] ?? { icon: "?", color: "white" };
  const isStale = stale && !TERMINAL_STATUSES.has(status);

  if (isStale) {
    // Format elapsed time since last state change
    let elapsed = "";
    if (stateMtimeMs != null) {
      const diffMs = Date.now() - stateMtimeMs;
      const minutes = Math.floor(diffMs / 60_000);
      if (minutes < 60) {
        elapsed = ` (${minutes}m)`;
      } else {
        const hours = Math.floor(minutes / 60);
        elapsed = ` (${hours}h)`;
      }
    }
    // Red text, dims on blink-off cycle to create blink effect
    return (
      <Text color="red" bold dimColor={!blinkOn}>
        {config.icon} {status}{elapsed}
      </Text>
    );
  }

  return (
    <Text color={config.color}>
      {config.icon} {status}
    </Text>
  );
}
