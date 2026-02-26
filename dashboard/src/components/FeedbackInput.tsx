import React, { useState } from "react";
import { Box, Text } from "ink";
import TextInput from "ink-text-input";
import type { SessionData } from "../utils/types.js";

interface FeedbackInputProps {
  session: SessionData;
  onSubmit: (text: string) => void;
  onCancel: () => void;
}

export function FeedbackInput({ session, onSubmit, onCancel }: FeedbackInputProps) {
  const [value, setValue] = useState("");

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>
        Feedback for {session.meta.repo}/{session.meta.branch}:
      </Text>
      <Box marginTop={1}>
        <Text color="cyan">{"> "}</Text>
        <TextInput
          value={value}
          onChange={setValue}
          onSubmit={(text) => {
            if (text.trim()) {
              onSubmit(text.trim());
            } else {
              onCancel();
            }
          }}
        />
      </Box>
      <Box marginTop={1}>
        <Text dimColor>[Enter] Send  [Empty+Enter] Cancel</Text>
      </Box>
    </Box>
  );
}
