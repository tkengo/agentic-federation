import React from "react";
import { Text } from "ink";

interface StatusBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<
  string,
  { icon: string; color: string }
> = {
  PLANNING: { icon: "~", color: "blue" },
  PLAN_REVIEW: { icon: "*", color: "yellow" },
  PLAN_REVISION: { icon: "~", color: "yellow" },
  IMPLEMENTING: { icon: "~", color: "blue" },
  CODE_REVIEW: { icon: "*", color: "yellow" },
  CODE_REVISION: { icon: "~", color: "yellow" },
  WAITING_HUMAN: { icon: "!", color: "magenta" },
  COMPLETED: { icon: "+", color: "green" },
  APPROVED: { icon: "+", color: "green" },
  active: { icon: "-", color: "cyan" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { icon: "?", color: "white" };

  return (
    <Text color={config.color}>
      {config.icon} {status}
    </Text>
  );
}
