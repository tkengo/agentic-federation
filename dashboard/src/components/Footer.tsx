import React from "react";
import { Box, Text } from "ink";
import { useFooter } from "../contexts/FooterContext.js";

export function Footer() {
  const { state } = useFooter();
  const { override, ctrlCPending, message, messageColor } = state;

  let content: React.ReactNode = <Text>{" "}</Text>;

  if (override?.type === "cleaning") {
    content = <Text color="yellow">Cleaning worktrees...</Text>;
  } else if (override?.type === "confirmClean") {
    content = (
      <Text color="yellow">
        Clean {override.count} worktrees? [y]Yes  [f]Force (include dirty)  [any key]Cancel
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
    content = <Text color={messageColor}>{message}</Text>;
  }

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      {content}
    </Box>
  );
}
