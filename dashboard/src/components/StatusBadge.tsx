import React from "react";
import { Text } from "ink";
import type { StatusConfig } from "../utils/types.js";

interface StatusBadgeProps {
  status: string;
  stale?: boolean;
  statusConfigMap?: Record<string, StatusConfig>;
  stateMtimeMs?: number;
}

const DEFAULT_MARK: StatusConfig = { mark: "●", color: "white" };

// Terminal statuses that should never show as stale
const TERMINAL_STATUSES = new Set(["completed", "approved", "waiting_human"]);

export function StatusBadge({ status, stale, statusConfigMap, stateMtimeMs }: StatusBadgeProps) {
  const config = statusConfigMap?.[status] ?? DEFAULT_MARK;
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
    return (
      <Text color="red" bold>
        {config.mark} {status}{elapsed}
      </Text>
    );
  }

  return (
    <Text color={config.color}>
      {config.mark} {status}
    </Text>
  );
}
