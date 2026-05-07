import React from "react";
import { Box, Text } from "ink";
import { SessionRow } from "./SessionRow.js";
import { ScrollableRows } from "./ScrollableRows.js";
import { statusDisplayWidth } from "./StatusBadge.js";
import { useBlink } from "../hooks/useBlink.js";
import { computeScrollOffset } from "../utils/scroll.js";
import { STALE_THRESHOLD_SEC } from "../utils/types.js";
import type { SessionData } from "../utils/types.js";

interface SessionListProps {
  sessions: SessionData[];
  dimmed?: boolean;
  selectedIndex?: number;
  maxVisible: number;
}

type RenderedItem =
  | { kind: "spacer" }
  | { kind: "group"; repo: string; count: number }
  | { kind: "row"; session: SessionData; sessionIndex: number };

export function SessionList({ sessions, dimmed, selectedIndex, maxVisible }: SessionListProps) {
  const anyWaiting = sessions.some((s) => s.waitingHuman.waiting);
  const blinkOn = useBlink(500, anyWaiting);

  const colWidths = {
    session: Math.max(7, ...sessions.map((s) => s.name.length)),
    workflow: Math.max(8, ...sessions.map((s) => (s.workflow ?? "solo").length)),
    status: Math.max(6, ...sessions.map((s) => {
      const displayStatus = s.tmuxAlive ? s.status : "disconnected";
      const stale = s.stateMtimeMs != null && (Date.now() - s.stateMtimeMs) / 1000 >= STALE_THRESHOLD_SEC;
      return statusDisplayWidth(displayStatus, s.tmuxAlive ? s.currentStep : null, stale, s.stateMtimeMs, s.waitingHuman.waiting);
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

  // Build groups by repo, preserving the existing sort order (repo asc, branch asc)
  const groups: { repo: string; rows: { session: SessionData; sessionIndex: number }[] }[] = [];
  sessions.forEach((session, idx) => {
    const repo = session.meta.repo || session.name;
    const last = groups[groups.length - 1];
    if (last && last.repo === repo) {
      last.rows.push({ session, sessionIndex: idx });
    } else {
      groups.push({ repo, rows: [{ session, sessionIndex: idx }] });
    }
  });

  // Flatten into a single list of rendered items so scrolling can treat
  // headers and spacers uniformly with session rows.
  const renderedItems: RenderedItem[] = [];
  groups.forEach((group, gi) => {
    if (gi > 0) renderedItems.push({ kind: "spacer" });
    renderedItems.push({ kind: "group", repo: group.repo, count: group.rows.length });
    for (const r of group.rows) {
      renderedItems.push({ kind: "row", session: r.session, sessionIndex: r.sessionIndex });
    }
  });

  // Find rendered index of the selected session for scroll computation
  const renderedSelectedIndex =
    selectedIndex === undefined
      ? 0
      : Math.max(0, renderedItems.findIndex((it) => it.kind === "row" && it.sessionIndex === selectedIndex));

  const visibleRows = Math.max(1, maxVisible - 1); // subtract column header row
  const scrollOffset = computeScrollOffset(renderedSelectedIndex, renderedItems.length, visibleRows);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Column header */}
      <Box>
        <Text dimColor>
          {`    ${"SESSION".padEnd(colWidths.session)}  ${"WORKFLOW".padEnd(colWidths.workflow)}  ${"STATUS".padEnd(colWidths.status + 2)}  CREATED`}
        </Text>
      </Box>

      <ScrollableRows
        items={renderedItems}
        maxVisible={visibleRows}
        scrollOffset={scrollOffset}
        keyExtractor={(item, idx) => {
          if (item.kind === "row") return `row-${item.session.name}`;
          if (item.kind === "group") return `group-${item.repo}-${idx}`;
          return `spacer-${idx}`;
        }}
        renderRow={(item) => {
          if (item.kind === "spacer") {
            return <Text>{" "}</Text>;
          }
          if (item.kind === "group") {
            return (
              <Box>
                <Text color={dimmed ? undefined : "magenta"} bold dimColor={dimmed}>
                  {`  ${item.repo}`}
                </Text>
                <Text dimColor>{`  (${item.count})`}</Text>
              </Box>
            );
          }
          return (
            <SessionRow
              session={item.session}
              selected={!dimmed && selectedIndex === item.sessionIndex}
              dimmed={dimmed}
              colWidths={colWidths}
              blinkOn={anyWaiting ? blinkOn : true}
            />
          );
        }}
      />
    </Box>
  );
}
