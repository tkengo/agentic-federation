import React from "react";
import { Box, Text } from "ink";
import { SessionRow } from "./SessionRow.js";
import { useBlink } from "../hooks/useBlink.js";
import type { SessionData } from "../utils/types.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";

interface SessionListProps {
  sessions: SessionData[];
  selectedIndex: number;
  dimmed?: boolean;
}

function hasAnyStaleSessions(sessions: SessionData[]): boolean {
  const now = Date.now();
  return sessions.some(
    (s) => s.stateMtimeMs != null && (now - s.stateMtimeMs) / 1000 >= STALE_THRESHOLD_SEC
  );
}

export function SessionList({ sessions, selectedIndex, dimmed }: SessionListProps) {
  const blinkOn = useBlink(500);
  const anyStale = hasAnyStaleSessions(sessions);

  if (sessions.length === 0) {
    return (
      <Box paddingX={2} paddingY={1}>
        <Text dimColor>No active sessions.</Text>
      </Box>
    );
  }

  // Calculate column widths (add space for stale elapsed time suffix)
  const staleExtra = anyStale ? 6 : 0;
  const colWidths = {
    repo: Math.max(4, ...sessions.map((s) => s.meta.repo.length)),
    branch: Math.max(6, ...sessions.map((s) => s.meta.branch.length)),
    workflow: Math.max(8, ...sessions.map((s) => (s.workflow ?? "solo").length)),
    status: Math.max(6, ...sessions.map((s) => s.status.length + 2)) + staleExtra,
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header row */}
      <Box>
        <Text dimColor>
          {`    ${"REPO".padEnd(colWidths.repo)}  ${"BRANCH".padEnd(colWidths.branch)}  ${"WORKFLOW".padEnd(colWidths.workflow)}  ${"STATUS".padEnd(colWidths.status + 2)}       AGE`}
        </Text>
      </Box>
      {/* Session rows */}
      {sessions.map((session, index) => (
        <SessionRow
          key={session.name}
          session={session}
          selected={index === selectedIndex}
          dimmed={dimmed}
          colWidths={colWidths}
          blinkOn={anyStale ? blinkOn : true}
        />
      ))}
    </Box>
  );
}
