import React from "react";
import { Box, Text } from "ink";
import { formatTime } from "../utils/format.js";

interface HeaderProps {
  sessionCount: number;
  title?: string;
}

export function Header({ sessionCount, title }: HeaderProps) {
  const displayTitle = title ?? "fed dashboard";

  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      paddingX={1}
      justifyContent="space-between"
    >
      <Text bold>{displayTitle}</Text>
      <Text>
        <Text dimColor>{sessionCount} sessions</Text>
        {"  "}
        <Text>{formatTime()}</Text>
      </Text>
    </Box>
  );
}
