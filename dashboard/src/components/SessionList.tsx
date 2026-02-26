import React from "react";
import { Box, Text } from "ink";
import { SessionRow } from "./SessionRow.js";
import type { SessionData } from "../utils/types.js";

interface SessionListProps {
  sessions: SessionData[];
  selectedIndex: number;
}

export function SessionList({ sessions, selectedIndex }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>No active sessions.</Text>
      </Box>
    );
  }

  // Calculate column widths
  const colWidths = {
    repo: Math.max(4, ...sessions.map((s) => s.meta.repo.length)),
    branch: Math.max(6, ...sessions.map((s) => s.meta.branch.length)),
    mode: Math.max(4, ...sessions.map((s) => s.meta.mode.length)),
    status: Math.max(6, ...sessions.map((s) => s.status.length + 2)),
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header row */}
      <Box>
        <Text dimColor>
          {`    ${"REPO".padEnd(colWidths.repo)}  ${"BRANCH".padEnd(colWidths.branch)}  ${"MODE".padEnd(colWidths.mode)}  ${"STATUS".padEnd(colWidths.status + 2)}   AGE`}
        </Text>
      </Box>
      {/* Session rows */}
      {sessions.map((session, index) => (
        <SessionRow
          key={session.name}
          session={session}
          selected={index === selectedIndex}
          colWidths={colWidths}
        />
      ))}
    </Box>
  );
}
