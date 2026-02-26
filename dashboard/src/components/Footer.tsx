import React from "react";
import { Box, Text } from "ink";

interface FooterProps {
  screen: "list" | "preview" | "feedback";
}

export function Footer({ screen }: FooterProps) {
  if (screen === "preview") {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text dimColor>
          [q/Esc] Back  [a] Approve  [f] Feedback  [Enter] Switch
        </Text>
      </Box>
    );
  }

  if (screen === "feedback") {
    return (
      <Box borderStyle="single" borderTop={false} paddingX={1}>
        <Text dimColor>[Enter] Send  [Empty+Enter] Cancel</Text>
      </Box>
    );
  }

  return (
    <Box borderStyle="single" borderTop={false} paddingX={1}>
      <Text dimColor>
        [Enter] Switch  [p] Preview  [a] Approve  [f] Feedback  [k]
        Kill  [q] Quit
      </Text>
    </Box>
  );
}
