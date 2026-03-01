import React from "react";
import { Box, Text } from "ink";

interface FooterProps {
  confirmingClean?: boolean;
  cleanableCount?: number;
  cleaning?: boolean;
  confirmingKill?: boolean;
  killTargetName?: string;
  ctrlCPending?: boolean;
  confirmingScript?: boolean;
  confirmScriptName?: string;
  message?: string | null;
}

export function Footer({
  cleaning, confirmingClean, cleanableCount,
  confirmingKill, killTargetName,
  ctrlCPending, confirmingScript, confirmScriptName,
  message,
}: FooterProps) {
  let content: React.ReactNode = <Text>{" "}</Text>;

  if (cleaning) {
    content = <Text color="yellow">Cleaning worktrees...</Text>;
  } else if (confirmingClean) {
    content = (
      <Text color="yellow">
        Clean {cleanableCount} worktrees? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (confirmingKill && killTargetName) {
    content = (
      <Text color="yellow">
        Stop session &quot;{killTargetName}&quot;? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (confirmingScript && confirmScriptName) {
    content = (
      <Text color="yellow">
        Run script &quot;{confirmScriptName}&quot;? [y]Yes  [any key]Cancel
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
