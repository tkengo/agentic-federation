import React, { useMemo } from "react";
import { Box, Text } from "ink";
import { SessionRow } from "./SessionRow.js";
import { ScrollableRows } from "./ScrollableRows.js";
import { useBlink } from "../hooks/useBlink.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";
import type { SessionData } from "../utils/types.js";

interface SessionListProps {
  sessions: SessionData[];
  dimmed?: boolean;
  selectedIndex?: number;
  maxVisible: number;
  scrollOffset: number;
}

function hasAnyStaleSessions(sessions: SessionData[]): boolean {
  const now = Date.now();
  return sessions.some(
    (s) => s.stateMtimeMs != null && (now - s.stateMtimeMs) / 1000 >= STALE_THRESHOLD_SEC
  );
}

export function SessionList({ sessions, dimmed, selectedIndex, maxVisible, scrollOffset }: SessionListProps) {
  const anyStale = hasAnyStaleSessions(sessions);
  const anyWaiting = sessions.some((s) => s.waitingHuman.waiting);
  const blinkOn = useBlink(500, anyWaiting);

  const colWidths = useMemo(() => {
    const staleExtra = anyStale ? 6 : 0;
    return {
      repo: Math.max(4, ...sessions.map((s) =>
        s.meta.repo ? s.meta.repo.length : s.name.length
      )),
      session: Math.max(7, ...sessions.map((s) => s.name.length)),
      workflow: Math.max(8, ...sessions.map((s) => (s.workflow ?? "solo").length)),
      status: Math.max(6, ...sessions.map((s) => s.status.length + 2)) + staleExtra,
    };
  }, [sessions, anyStale]);

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box paddingX={2}>
          <Text dimColor>{"   No active sessions. Press [a] to create one."}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Column header */}
      <Box>
        <Text dimColor>
          {`    ${"REPO".padEnd(colWidths.repo)}  ${"SESSION".padEnd(colWidths.session)}  ${"WORKFLOW".padEnd(colWidths.workflow)}  ${"STATUS".padEnd(colWidths.status + 2)}       AGE`}
        </Text>
      </Box>

      <ScrollableRows
        items={sessions}
        maxVisible={maxVisible - 1} // subtract column header row
        scrollOffset={scrollOffset}
        keyExtractor={(s) => s.name}
        renderRow={(session, i) => (
          <SessionRow
            session={session}
            selected={!dimmed && selectedIndex === i}
            dimmed={dimmed}
            colWidths={colWidths}
            blinkOn={anyWaiting ? blinkOn : true}
          />
        )}
      />
    </Box>
  );
}
