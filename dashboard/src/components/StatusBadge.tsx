import React from "react";
import { Text } from "ink";

interface StatusBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<
  string,
  { icon: string; color: string }
> = {
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

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { icon: "?", color: "white" };

  return (
    <Text color={config.color}>
      {config.icon} {status}
    </Text>
  );
}
