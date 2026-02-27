import React from "react";
import { Box, Text } from "ink";

interface FooterProps {
  screen: "list" | "preview" | "feedback" | "create" | "palette";
  createStep?: "workflow" | "repo" | "branch";
  hasSelectedSession?: boolean;
  cleanRowSelected?: boolean;
  confirmingClean?: boolean;
  cleanableCount?: number;
  cleaning?: boolean;
  confirmingKill?: boolean;
  killTargetName?: string;
  ctrlCPending?: boolean;
}

export function Footer({ screen, createStep, hasSelectedSession, cleanRowSelected, confirmingClean, cleanableCount, cleaning, confirmingKill, killTargetName, ctrlCPending }: FooterProps) {
  if (cleaning) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">Cleaning worktrees...</Text>
      </Box>
    );
  }

  const quitHint = ctrlCPending
    ? <Text color="yellow">Press Ctrl+C again to quit</Text>
    : <Text dimColor>[C-c C-c] Quit</Text>;

  if (confirmingClean) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">
          Clean {cleanableCount} worktrees? [y] Yes  [any key] Cancel
        </Text>
      </Box>
    );
  }

  if (confirmingKill && killTargetName) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text color="yellow">
          Stop session &quot;{killTargetName}&quot;? [y] Yes  [any key] Cancel
        </Text>
      </Box>
    );
  }

  if (screen === "palette") {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>
          <Text dimColor>{"[Enter] Execute  [Up/Down] Navigate  [Esc] Close  "}</Text>
          {quitHint}
        </Text>
      </Box>
    );
  }

  if (screen === "create") {
    let hint: string;
    if (createStep === "branch") {
      hint = "[Enter] Create  [Empty+Enter/Esc] Back";
    } else if (createStep === "repo") {
      hint = "[j/k] Select  [Enter] Next  [Esc] Back";
    } else {
      hint = "[j/k] Select  [Enter] Next  [Esc] Cancel";
    }
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>
          <Text dimColor>{hint + "  "}</Text>
          {quitHint}
        </Text>
      </Box>
    );
  }

  if (screen === "preview") {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>
          <Text dimColor>{"[q/Esc] Back  [a] Approve  [f] Feedback  [Enter] Switch  "}</Text>
          {quitHint}
        </Text>
      </Box>
    );
  }

  if (screen === "feedback") {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>
          <Text dimColor>{"[Enter] Send  [Empty+Enter] Cancel  "}</Text>
          {quitHint}
        </Text>
      </Box>
    );
  }

  // List screen - clean row selected
  if (cleanRowSelected) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>
          <Text dimColor>{"[Enter] Clean  [n] New  [:] Commands  "}</Text>
          {quitHint}
        </Text>
      </Box>
    );
  }

  // List screen - session selected
  if (hasSelectedSession) {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text>
          <Text dimColor>{"[Enter] Switch  [n] New  [p] Preview  [a] Approve  [f] Feedback  [s] Stop  [:] Commands  "}</Text>
          {quitHint}
        </Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Text>
        <Text dimColor>{"[n] New  [:] Commands  "}</Text>
        {quitHint}
      </Text>
    </Box>
  );
}
