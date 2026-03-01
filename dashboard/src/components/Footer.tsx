import React from "react";
import { Box, Text } from "ink";
import type { FooterOverride } from "../utils/types.js";

interface FooterProps {
  override?: FooterOverride;
  ctrlCPending?: boolean;
  message?: string | null;
}

export function Footer({ override, ctrlCPending, message }: FooterProps) {
  let content: React.ReactNode = <Text>{" "}</Text>;

  if (override?.type === "cleaning") {
    content = <Text color="yellow">Cleaning worktrees...</Text>;
  } else if (override?.type === "confirmClean") {
    content = (
      <Text color="yellow">
        Clean {override.count} worktrees? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (override?.type === "confirmKill") {
    content = (
      <Text color="yellow">
        Stop session &quot;{override.name}&quot;? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (override?.type === "confirmScript") {
    content = (
      <Text color="yellow">
        Run script &quot;{override.name}&quot;? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (ctrlCPending) {
    content = <Text color="yellow">Press Ctrl+C again to quit</Text>;
  } else if (message) {
    content = <Text color="green">{message}</Text>;
  }

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      {content}
    </Box>
  );
}
