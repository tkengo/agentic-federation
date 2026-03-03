import React from "react";
import { Box, Text } from "ink";
import { SessionRow } from "./SessionRow.js";
import { useBlink } from "../hooks/useBlink.js";
import type { SessionData } from "../utils/types.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";

export interface ColWidths {
  repoBranch: number;
  workflow: number;
  status: number;
}

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
  const anyStale = hasAnyStaleSessions(sessions);
  const anyWaiting = sessions.some((s) => s.waitingHuman.waiting);
  // Only run the blink timer when there are waiting sessions to animate.
  // This avoids 500ms re-render cycles that disrupt IME cursor positioning.
  const blinkOn = useBlink(500, anyWaiting);

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        {/* Section title */}
        <Text dimColor>
          {"  ── Sessions ────────────────────────────────────────────────"}
        </Text>

        {/* Spacer between title and list */}
        <Text>{" "}</Text>

        <Box paddingX={2}>
          <Text dimColor>No active sessions.</Text>
        </Box>
      </Box>
    );
  }

  // Calculate column widths (add space for stale elapsed time suffix)
  const staleExtra = anyStale ? 6 : 0;
  const colWidths: ColWidths = {
    repoBranch: Math.max(11, ...sessions.map((s) =>
      s.meta.repo ? `${s.meta.repo}/${s.meta.branch}`.length : s.name.length
    )),
    workflow: Math.max(8, ...sessions.map((s) => (s.workflow ?? "solo").length)),
    status: Math.max(6, ...sessions.map((s) => s.status.length + 2)) + staleExtra,
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Section title */}
      <Text dimColor>
        {"  ── Sessions ────────────────────────────────────────────────"}
      </Text>

      {/* Spacer between title and list */}
      <Text>{" "}</Text>

      {/* Header row */}
      <Box>
        <Text dimColor>
          {`    ${"REPO/BRANCH".padEnd(colWidths.repoBranch)}  ${"WORKFLOW".padEnd(colWidths.workflow)}  ${"STATUS".padEnd(colWidths.status + 2)}       AGE`}
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
          blinkOn={anyWaiting ? blinkOn : true}
        />
      ))}
    </Box>
  );
}
