import React from "react";
import { Box, Text } from "ink";
import { SessionRow } from "./SessionRow.js";
import { ScrollableRows } from "./ScrollableRows.js";
import { statusDisplayWidth } from "./StatusBadge.js";
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

export function SessionList({ sessions, dimmed, selectedIndex, maxVisible, scrollOffset }: SessionListProps) {
  const anyWaiting = sessions.some((s) => s.waitingHuman.waiting);
  const blinkOn = useBlink(500, anyWaiting);

  const colWidths = {
    repo: Math.max(4, ...sessions.map((s) =>
      s.meta.repo ? s.meta.repo.length : s.name.length
    )),
    session: Math.max(7, ...sessions.map((s) => s.name.length)),
    workflow: Math.max(8, ...sessions.map((s) => (s.workflow ?? "solo").length)),
    status: Math.max(6, ...sessions.map((s) => {
      const stale = s.stateMtimeMs != null && (Date.now() - s.stateMtimeMs) / 1000 >= STALE_THRESHOLD_SEC;
      return statusDisplayWidth(s.status, s.currentStep, stale, s.stateMtimeMs, s.waitingHuman.waiting);
    })),
  };

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
