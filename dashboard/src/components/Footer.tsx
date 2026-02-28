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
}

export function Footer({
  cleaning, confirmingClean, cleanableCount,
  confirmingKill, killTargetName,
  ctrlCPending, confirmingScript, confirmScriptName,
}: FooterProps) {
  if (cleaning) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">Cleaning worktrees...</Text>
      </Box>
    );
  }

  if (confirmingClean) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">
          Clean {cleanableCount} worktrees? [y]Yes  [any key]Cancel
        </Text>
      </Box>
    );
  }

  if (confirmingKill && killTargetName) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">
          Stop session &quot;{killTargetName}&quot;? [y]Yes  [any key]Cancel
        </Text>
      </Box>
    );
  }

  if (confirmingScript && confirmScriptName) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">
          Run script &quot;{confirmScriptName}&quot;? [y]Yes  [any key]Cancel
        </Text>
      </Box>
    );
  }

  if (ctrlCPending) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">Press Ctrl+C again to quit</Text>
      </Box>
    );
  }

  // Default: empty footer (border only)
  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Text>{" "}</Text>
    </Box>
  );
}
