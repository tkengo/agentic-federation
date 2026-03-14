import React from "react";
import { Box, Text } from "ink";
import { ScrollableRows } from "./ScrollableRows.js";
import { formatAge } from "../utils/format.js";
import type { RestorableSessionData } from "../utils/types.js";

interface RestorableListProps {
  sessions: RestorableSessionData[];
  dimmed?: boolean;
  selectedIndex?: number;
  maxVisible: number;
  scrollOffset: number;
}

export function RestorableList({ sessions, dimmed, selectedIndex, maxVisible, scrollOffset }: RestorableListProps) {
  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Box paddingX={2}>
          <Text dimColor>{"   No restorable sessions."}</Text>
        </Box>
      </Box>
    );
  }

  // Calculate column widths
  const colWidths = {
    repoBranch: Math.max(11, ...sessions.map((s) =>
      s.meta.repo ? `${s.meta.repo}/${s.meta.branch}`.length : s.name.length
    )),
    workflow: Math.max(8, ...sessions.map((s) => (s.workflow ?? "solo").length)),
    status: Math.max(6, ...sessions.map((s) => s.status.length)),
  };

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Column header */}
      <Box>
        <Text dimColor>
          {`    ${"REPO/BRANCH".padEnd(colWidths.repoBranch)}  ${"WORKFLOW".padEnd(colWidths.workflow)}  ${"STATUS".padEnd(colWidths.status)}       AGE`}
        </Text>
      </Box>

      <ScrollableRows
        items={sessions}
        maxVisible={maxVisible - 1} // subtract column header row
        scrollOffset={scrollOffset}
        keyExtractor={(s) => s.name}
        renderRow={(session, i) => {
          const selected = !dimmed && selectedIndex === i;
          const cursor = selected ? ">" : " ";
          const highlight = selected;
          const label = session.meta.repo
            ? `${session.meta.repo}/${session.meta.branch}`
            : session.name;

          return (
            <Box>
              <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
                {` ${cursor} `}
              </Text>
              <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
                {label.padEnd(colWidths.repoBranch)}
              </Text>
              <Text dimColor={dimmed}>{`  `}</Text>
              <Text color={highlight ? "cyan" : undefined} bold={highlight} dimColor={dimmed}>
                {(session.workflow ?? "solo").padEnd(colWidths.workflow)}
              </Text>
              <Text dimColor={dimmed}>{`  `}</Text>
              <Text dimColor>{session.status.padEnd(colWidths.status)}</Text>
              <Text dimColor>{`       `}</Text>
              <Text dimColor>{session.age.padStart(4)}</Text>
            </Box>
          );
        }}
      />
    </Box>
  );
}
