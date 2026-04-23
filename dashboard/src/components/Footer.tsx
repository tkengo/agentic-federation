import React from "react";
import { Box, Text } from "ink";
import { useFooter } from "../contexts/FooterContext.js";
import { Spinner } from "./Spinner.js";

export function Footer() {
  const { state } = useFooter();
  const { override, ctrlCPending, message, messageColor } = state;

  let content: React.ReactNode = <Text>{" "}</Text>;

  if (override?.type === "cleaning") {
    content = (
      <Text color="yellow">
        <Spinner /> Cleaning worktrees...
      </Text>
    );
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
  } else if (override?.type === "confirmDeleteSession") {
    content = (
      <Text color="yellow">
        Delete session &quot;{override.name}&quot;? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (override?.type === "confirmDeleteRepo") {
    content = (
      <Text color="yellow">
        Delete repository &quot;{override.name}&quot; (config + workspace)? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (override?.type === "confirmUnprotect") {
    content = (
      <Text color="yellow">
        Unprotect &quot;{override.name}&quot;? [y]Yes  [any key]Cancel
      </Text>
    );
  } else if (override?.type === "creating") {
    content = (
      <Text color="yellow">
        <Spinner /> Creating session...
      </Text>
    );
  } else if (override?.type === "renaming") {
    content = (
      <Text color="yellow">
        Renaming &quot;{override.name}&quot;  [Enter]Confirm  [Esc]Cancel
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
