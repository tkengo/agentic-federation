import React from "react";
import { Box, Text } from "ink";
import type { RestorableSessionData } from "../utils/types.js";

interface RestorableSessionListProps {
  sessions: RestorableSessionData[];
  selectedIndex: number | undefined; // undefined = none selected in this section
  dimmed?: boolean;
}

export function RestorableSessionList({ sessions, selectedIndex, dimmed }: RestorableSessionListProps) {
  if (sessions.length === 0) return null;

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
      {/* Spacer */}
      <Text>{" "}</Text>

      {/* Section title */}
      <Text dimColor>
        {"  ── Restorable ──────────────────────────────────────────"}
      </Text>

      {/* Spacer */}
      <Text>{" "}</Text>

      {/* Header row */}
      <Box>
        <Text dimColor>
          {`    ${"REPO/BRANCH".padEnd(colWidths.repoBranch)}  ${"WORKFLOW".padEnd(colWidths.workflow)}  ${"STATUS".padEnd(colWidths.status)}       AGE`}
        </Text>
      </Box>

      {/* Rows */}
      {sessions.map((session, index) => {
        const selected = index === selectedIndex;
        const cursor = !dimmed && selected ? ">" : " ";
        const highlight = !dimmed && selected;
        const label = session.meta.repo
          ? `${session.meta.repo}/${session.meta.branch}`
          : session.name;

        return (
          <Box key={session.name}>
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
      })}
    </Box>
  );
}
